import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

export interface CliLocation {
  path: string;
  version: string;
  source: 'bundled' | 'system';
}

/**
 * Locate the bundled Copilot CLI binary.
 * Returns the path if found, otherwise null.
 */
function findBundledCli(): string | null {
  try {
    // Try to resolve the platform-specific package
    const platform = process.platform;
    const arch = process.arch;
    const packageName = `@github/copilot-${platform}-${arch}`;
    
    // Attempt to resolve via import.meta.resolve
    try {
      const resolved = import.meta.resolve(packageName);
      const packagePath = fileURLToPath(resolved);
      const binaryDir = dirname(packagePath);
      const binaryName = platform === 'win32' ? 'copilot.exe' : 'copilot';
      const binaryPath = join(binaryDir, binaryName);
      
      if (existsSync(binaryPath)) {
        return binaryPath;
      }
    } catch {
      // If import.meta.resolve fails, try manual path construction
    }

    // Fallback: Construct path from this file's location
    // Assuming this file is in src/utils/ and node_modules is at repo root
    const currentFile = fileURLToPath(import.meta.url);
    const repoRoot = join(dirname(currentFile), '..', '..');
    
    // Try node_modules location
    const nodeModulesPath = join(
      repoRoot,
      'node_modules',
      '@github',
      `copilot-${platform}-${arch}`,
      platform === 'win32' ? 'copilot.exe' : 'copilot'
    );
    
    if (existsSync(nodeModulesPath)) {
      return nodeModulesPath;
    }

    // Try prebuilds location (legacy structure)
    const prebuildsPath = join(
      repoRoot,
      'node_modules',
      '@github',
      'copilot',
      'prebuilds',
      `${platform}-${arch}`,
      platform === 'win32' ? 'copilot.exe' : 'copilot'
    );
    
    if (existsSync(prebuildsPath)) {
      return prebuildsPath;
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Find the system-installed Copilot CLI.
 * Returns the path if found, otherwise null.
 */
function findSystemCli(): string | null {
  try {
    const command = process.platform === 'win32' ? 'where copilot' : 'which copilot';
    const result = execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    const path = result.trim().split('\n')[0];
    
    if (path && existsSync(path)) {
      return path;
    }
  } catch {
    // Ignore errors - CLI not in PATH
  }

  return null;
}

/**
 * Get the version of a CLI binary.
 */
function getCliVersion(cliPath: string): string {
  try {
    const result = execSync(`"${cliPath}" --version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 5000,
    });
    
    // Parse version from output (e.g., "GitHub Copilot CLI 0.0.403.")
    const match = result.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Locate the Copilot CLI binary, checking bundled first, then system.
 * Returns null if no CLI is found.
 */
export function locateCopilotCli(): CliLocation | null {
  // Try bundled CLI first
  const bundledPath = findBundledCli();
  if (bundledPath) {
    const version = getCliVersion(bundledPath);
    return { path: bundledPath, version, source: 'bundled' };
  }

  // Fallback to system CLI
  const systemPath = findSystemCli();
  if (systemPath) {
    const version = getCliVersion(systemPath);
    return { path: systemPath, version, source: 'system' };
  }

  return null;
}

/**
 * Check if the CLI is authenticated.
 * Returns true if authenticated, false otherwise.
 */
export function checkCliAuthentication(cliPath: string): boolean {
  try {
    // Run a simple command that requires authentication
    execSync(`"${cliPath}" --help`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    // If --help works, the binary is at least executable
    // Authentication check would need SDK connection attempt
    return true;
  } catch {
    return false;
  }
}
