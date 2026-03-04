import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import type { SessionConfig, ToolResultObject } from '@github/copilot-sdk';

type SessionHooks = NonNullable<SessionConfig['hooks']>;

interface PreToolUseInput {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: unknown;
}

interface PostToolUseInput {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: unknown;
  toolResult: ToolResultObject;
}

const CONFIG_PATH = join(process.cwd(), '.planeteer', 'config.json');

export interface ToolOverrideConfig {
  /** Master switch for all tool overrides */
  enabled: boolean;
  editFile?: {
    /** Enforce files are within the working directory */
    enabled: boolean;
  };
  readFile?: {
    /** Warn/truncate files larger than this size in KB (default: 100) */
    enabled: boolean;
    maxSizeKb?: number;
  };
  grep?: {
    /** Scope grep to project-relevant directories */
    enabled: boolean;
    /** Directory patterns to exclude (default: node_modules, .git, dist, etc.) */
    excludePatterns?: string[];
  };
}

export interface ToolUsageStats {
  reads: number;
  edits: number;
  greps: number;
}

export function createEmptyStats(): ToolUsageStats {
  return { reads: 0, edits: 0, greps: 0 };
}

const DEFAULT_GREP_EXCLUDE = ['node_modules', '.git', 'dist', '.planeteer', 'coverage', '.next', '__pycache__'];
const DEFAULT_READ_MAX_SIZE_KB = 100;

export const DEFAULT_TOOL_OVERRIDE_CONFIG: ToolOverrideConfig = {
  enabled: true,
  editFile: { enabled: true },
  readFile: { enabled: true, maxSizeKb: DEFAULT_READ_MAX_SIZE_KB },
  grep: { enabled: true, excludePatterns: DEFAULT_GREP_EXCLUDE },
};

let cachedConfig: ToolOverrideConfig | null = null;

export async function loadToolOverrideConfig(): Promise<ToolOverrideConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = await readFile(CONFIG_PATH, 'utf-8');
      cachedConfig = { ...DEFAULT_TOOL_OVERRIDE_CONFIG, ...JSON.parse(raw) } as ToolOverrideConfig;
      return cachedConfig;
    }
  } catch { /* ignore */ }
  cachedConfig = { ...DEFAULT_TOOL_OVERRIDE_CONFIG };
  return cachedConfig;
}

export async function saveToolOverrideConfig(config: ToolOverrideConfig): Promise<void> {
  const dir = join(process.cwd(), '.planeteer');
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  cachedConfig = config;
}

/** Clear the config cache (for testing) */
export function clearToolOverrideConfigCache(): void {
  cachedConfig = null;
}

// Simple in-memory file cache for read_file overrides
const fileCache = new Map<string, string>();

export function clearFileCache(): void {
  fileCache.clear();
}

/** Resolve the file path from a tool invocation's arguments */
function resolveToolPath(toolArgs: unknown, cwd: string): string | null {
  if (!toolArgs || typeof toolArgs !== 'object') return null;
  const args = toolArgs as Record<string, unknown>;
  const rawPath = (args['path'] ?? args['file_path'] ?? args['filename'] ?? args['target_file']) as string | undefined;
  if (!rawPath || typeof rawPath !== 'string') return null;
  return isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
}

/** Check whether a resolved absolute path is within the working directory */
function isWithinWorkingDir(resolvedPath: string, workingDir: string): boolean {
  const normalised = resolve(resolvedPath);
  const base = resolve(workingDir);
  return normalised === base || normalised.startsWith(base + '/') || normalised.startsWith(base + '\\');
}

/** Get the grep `path`/`pattern` args as an object we can extend */
function getGrepArgs(toolArgs: unknown): Record<string, unknown> | null {
  if (!toolArgs || typeof toolArgs !== 'object') return null;
  return toolArgs as Record<string, unknown>;
}

/**
 * Build SDK `SessionHooks` that enforce Planeteer's tool override policies.
 *
 * @param config   Tool override configuration loaded from `.planeteer/config.json`
 * @param onToolUse  Optional callback invoked after each tool call with the tool name
 */
export function createSessionHooks(
  config: ToolOverrideConfig,
  onToolUse?: (toolName: string) => void,
): SessionHooks {
  const workingDir = process.cwd();

  const onPreToolUse = async (input: PreToolUseInput) => {
    if (!config.enabled) return;

    const { toolName, toolArgs, cwd } = input;
    const effectiveCwd = cwd || workingDir;

    // ── edit_file / str_replace_editor ──
    if (
      config.editFile?.enabled &&
      (toolName === 'edit_file' || toolName === 'str_replace_editor' || toolName === 'write_file')
    ) {
      const resolvedPath = resolveToolPath(toolArgs, effectiveCwd);
      if (resolvedPath && !isWithinWorkingDir(resolvedPath, workingDir)) {
        return {
          permissionDecision: 'deny' as const,
          permissionDecisionReason: `edit_file: path "${resolvedPath}" is outside the project workspace "${workingDir}". Only files within the working directory may be modified.`,
        };
      }
    }

    // ── read_file ──
    if (
      config.readFile?.enabled &&
      (toolName === 'read_file' || toolName === 'view_file')
    ) {
      const resolvedPath = resolveToolPath(toolArgs, effectiveCwd);
      if (resolvedPath) {
        // If cached, deny the tool call and supply the content directly via the denial reason.
        // This prevents redundant disk I/O while still giving the agent the file content.
        const cached = fileCache.get(resolvedPath);
        if (cached !== undefined) {
          return {
            permissionDecision: 'deny' as const,
            permissionDecisionReason: `[planeteer] Serving from cache for ${resolvedPath}:\n${cached}`,
          };
        }
        // Check file size and warn if over limit
        const maxBytes = (config.readFile?.maxSizeKb ?? DEFAULT_READ_MAX_SIZE_KB) * 1024;
        try {
          const fileInfo = await stat(resolvedPath);
          if (fileInfo.size > maxBytes) {
            return {
              additionalContext: `[planeteer] Warning: file "${resolvedPath}" is ${Math.round(fileInfo.size / 1024)}KB which exceeds the ${config.readFile?.maxSizeKb ?? DEFAULT_READ_MAX_SIZE_KB}KB limit. Consider reading specific line ranges.`,
            };
          }
        } catch { /* file may not exist yet */ }
      }
    }

    // ── grep ──
    if (config.grep?.enabled && toolName === 'grep') {
      const grepArgs = getGrepArgs(toolArgs);
      if (grepArgs) {
        const excludePatterns = config.grep?.excludePatterns ?? DEFAULT_GREP_EXCLUDE;
        // Build an --exclude-dir flag string that we inject into additional context
        const excludeHint = excludePatterns.map((p) => `--exclude-dir=${p}`).join(' ');
        const existingExcludeDirs = Array.isArray(grepArgs['exclude_dirs']) ? grepArgs['exclude_dirs'] as string[] : [];
        return {
          additionalContext: `[planeteer] Recommended: scope this grep with ${excludeHint} to skip non-project directories.`,
          modifiedArgs: {
            ...grepArgs,
            // Inject exclude_dirs, deduplicating to avoid repeated patterns
            exclude_dirs: Array.from(new Set([...existingExcludeDirs, ...excludePatterns])),
          },
        };
      }
    }
  };

  const onPostToolUse = (input: PostToolUseInput): void => {
    if (!config.enabled || !onToolUse) return;

    const { toolName, toolArgs, cwd, toolResult } = input;
    const effectiveCwd = cwd || workingDir;

    // Cache the file content after a successful read
    if (
      config.readFile?.enabled &&
      (toolName === 'read_file' || toolName === 'view_file') &&
      toolResult.resultType === 'success'
    ) {
      const resolvedPath = resolveToolPath(toolArgs, effectiveCwd);
      if (resolvedPath && typeof toolResult.textResultForLlm === 'string') {
        fileCache.set(resolvedPath, toolResult.textResultForLlm);
      }
    }

    onToolUse(toolName);
  };

  return { onPreToolUse, onPostToolUse };
}
