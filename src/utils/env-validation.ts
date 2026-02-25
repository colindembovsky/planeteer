/** Substrings that indicate a sensitive environment variable name. */
const SENSITIVE_PATTERNS = ['key', 'token', 'password', 'secret', 'credential', 'auth'];

/** Returns true if the env var name likely holds sensitive data. */
export function isSensitiveKey(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_PATTERNS.some((p) => lower.includes(p));
}

/** Returns a copy of the env map with sensitive values replaced by '***'. */
export function maskEnvVars(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([k, v]) => [k, isSensitiveKey(k) ? '***' : v]),
  );
}

/** Returns true if the name is a valid POSIX environment variable name. */
export function isValidEnvName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}
