import { describe, it, expect } from 'vitest';
import { isSensitiveKey, maskEnvVars, isValidEnvName } from '../utils/env-validation.js';

describe('isSensitiveKey', () => {
  it('should return true for keys containing sensitive patterns', () => {
    expect(isSensitiveKey('API_KEY')).toBe(true);
    expect(isSensitiveKey('GITHUB_TOKEN')).toBe(true);
    expect(isSensitiveKey('DB_PASSWORD')).toBe(true);
    expect(isSensitiveKey('MY_SECRET')).toBe(true);
    expect(isSensitiveKey('OAUTH_CREDENTIAL')).toBe(true);
    expect(isSensitiveKey('AUTH_HEADER')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(isSensitiveKey('api_key')).toBe(true);
    expect(isSensitiveKey('Github_Token')).toBe(true);
  });

  it('should return false for non-sensitive keys', () => {
    expect(isSensitiveKey('API_URL')).toBe(false);
    expect(isSensitiveKey('NODE_ENV')).toBe(false);
    expect(isSensitiveKey('PORT')).toBe(false);
    expect(isSensitiveKey('DEBUG')).toBe(false);
  });
});

describe('maskEnvVars', () => {
  it('should mask sensitive values', () => {
    const result = maskEnvVars({
      API_KEY: 'super-secret-key',
      NODE_ENV: 'production',
      GITHUB_TOKEN: 'ghp_abc123',
    });
    expect(result.API_KEY).toBe('***');
    expect(result.GITHUB_TOKEN).toBe('***');
    expect(result.NODE_ENV).toBe('production');
  });

  it('should return empty object for empty input', () => {
    expect(maskEnvVars({})).toEqual({});
  });
});

describe('isValidEnvName', () => {
  it('should accept valid POSIX names', () => {
    expect(isValidEnvName('FOO')).toBe(true);
    expect(isValidEnvName('FOO_BAR')).toBe(true);
    expect(isValidEnvName('_PRIVATE')).toBe(true);
    expect(isValidEnvName('foo123')).toBe(true);
  });

  it('should reject names starting with a digit', () => {
    expect(isValidEnvName('1FOO')).toBe(false);
  });

  it('should reject names containing spaces or special characters', () => {
    expect(isValidEnvName('FOO BAR')).toBe(false);
    expect(isValidEnvName('FOO-BAR')).toBe(false);
    expect(isValidEnvName('FOO.BAR')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(isValidEnvName('')).toBe(false);
  });
});
