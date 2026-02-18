import { describe, it, expect } from 'vitest';
import { locateCopilotCli } from './cli-locator.js';

describe('cli-locator', () => {
  it('should locate a Copilot CLI binary', () => {
    const location = locateCopilotCli();
    
    // Should find either bundled or system CLI
    expect(location).toBeTruthy();
    
    if (location) {
      expect(location.path).toBeTruthy();
      expect(['bundled', 'system']).toContain(location.source);
      expect(location.version).toBeTruthy();
    }
  });

  it('should return valid CLI info when found', () => {
    const location = locateCopilotCli();
    
    if (location) {
      // Verify the location has valid properties
      expect(location.source).toMatch(/^(bundled|system)$/);
      expect(location.path).toBeTruthy();
      expect(location.version).toBeTruthy();
    }
  });
});
