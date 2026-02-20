import { describe, it, expect } from 'vitest';
import { locateCopilotCli } from './cli-locator.js';

describe('cli-locator', () => {
  it('should return null or valid CLI info', () => {
    const location = locateCopilotCli();
    
    // Location may be null if CLI is not available (e.g., CI with --omit=optional)
    if (location) {
      expect(location.path).toBeTruthy();
      expect(['bundled', 'system']).toContain(location.source);
      expect(location.version).toBeTruthy();
    } else {
      // If no CLI is found, location should be null
      expect(location).toBeNull();
    }
  });

  it('should return valid structure when CLI is found', () => {
    const location = locateCopilotCli();
    
    // Only validate structure if a CLI was found
    if (location) {
      expect(location).toHaveProperty('path');
      expect(location).toHaveProperty('version');
      expect(location).toHaveProperty('source');
      expect(location.source).toMatch(/^(bundled|system)$/);
    }
  });
});
