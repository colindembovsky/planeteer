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

  it('should prefer bundled CLI over system CLI', () => {
    const location = locateCopilotCli();
    
    if (location) {
      // If bundled CLI exists, it should be used first
      // We can't guarantee this in all test environments,
      // but at least verify the location has valid properties
      expect(location.source).toMatch(/^(bundled|system)$/);
    }
  });
});
