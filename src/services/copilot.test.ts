import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getGlobalEnv, setGlobalEnv } from './copilot.js';

describe('Environment Variable Management', () => {
  let originalEnv: Record<string, string>;

  beforeEach(() => {
    // Save original global env
    originalEnv = getGlobalEnv();
  });

  afterEach(() => {
    // Restore original global env
    setGlobalEnv(originalEnv);
  });

  it('should get and set global environment variables', () => {
    const testEnv = { TEST_VAR: 'test_value', ANOTHER_VAR: 'another_value' };
    setGlobalEnv(testEnv);
    const retrieved = getGlobalEnv();
    expect(retrieved).toEqual(testEnv);
  });

  it('should return a copy of global env, not the original', () => {
    const testEnv = { TEST_VAR: 'test_value' };
    setGlobalEnv(testEnv);
    const retrieved = getGlobalEnv();
    retrieved.MODIFIED = 'new_value';
    const secondRetrieval = getGlobalEnv();
    expect(secondRetrieval).toEqual(testEnv);
    expect(secondRetrieval).not.toHaveProperty('MODIFIED');
  });

  it('should handle empty environment', () => {
    setGlobalEnv({});
    const retrieved = getGlobalEnv();
    expect(retrieved).toEqual({});
  });
});
