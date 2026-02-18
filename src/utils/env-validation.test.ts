import { describe, it, expect } from 'vitest';
import { isSensitiveEnvKey, validateEnvVars } from './env-validation.js';

describe('isSensitiveEnvKey', () => {
  it('should detect sensitive keys', () => {
    expect(isSensitiveEnvKey('API_KEY')).toBe(true);
    expect(isSensitiveEnvKey('api_key')).toBe(true);
    expect(isSensitiveEnvKey('PASSWORD')).toBe(true);
    expect(isSensitiveEnvKey('DB_PASSWORD')).toBe(true);
    expect(isSensitiveEnvKey('AUTH_TOKEN')).toBe(true);
    expect(isSensitiveEnvKey('SECRET_KEY')).toBe(true);
    expect(isSensitiveEnvKey('PRIVATE_KEY')).toBe(true);
  });

  it('should not flag non-sensitive keys', () => {
    expect(isSensitiveEnvKey('DATABASE_URL')).toBe(false);
    expect(isSensitiveEnvKey('LOG_LEVEL')).toBe(false);
    expect(isSensitiveEnvKey('PORT')).toBe(false);
    expect(isSensitiveEnvKey('NODE_ENV')).toBe(false);
  });
});

describe('validateEnvVars', () => {
  it('should return warnings for sensitive keys', () => {
    const env = {
      API_KEY: 'sk-123',
      DATABASE_URL: 'postgresql://localhost',
    };
    const warnings = validateEnvVars(env);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('API_KEY');
    expect(warnings[0]).toContain('sensitive');
  });

  it('should return no warnings for non-sensitive keys', () => {
    const env = {
      LOG_LEVEL: 'info',
      PORT: '3000',
    };
    const warnings = validateEnvVars(env);
    expect(warnings.length).toBe(0);
  });

  it('should handle empty env object', () => {
    const warnings = validateEnvVars({});
    expect(warnings.length).toBe(0);
  });
});
