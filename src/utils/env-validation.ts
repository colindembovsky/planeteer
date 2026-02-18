/**
 * Checks if an environment variable key appears to contain sensitive information.
 * Used to warn users when they might be storing secrets in plan files.
 */
export function isSensitiveEnvKey(key: string): boolean {
  const sensitivePatterns = [
    'key',
    'token',
    'password',
    'secret',
    'auth',
    'credential',
    'api_key',
    'apikey',
    'private',
    'pass',
  ];
  const lowerKey = key.toLowerCase();
  return sensitivePatterns.some(pattern => lowerKey.includes(pattern));
}

/**
 * Validates environment variable configuration and returns warnings if any.
 */
export function validateEnvVars(env: Record<string, string>): string[] {
  const warnings: string[] = [];
  
  for (const key of Object.keys(env)) {
    if (isSensitiveEnvKey(key)) {
      warnings.push(`Environment variable "${key}" appears to contain sensitive data. Avoid committing secrets to version control.`);
    }
  }
  
  return warnings;
}
