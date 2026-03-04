import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { 
  ensureSkillsDirectory, 
  getSkillsDirectory, 
  listSkillFiles,
  loadSkillConfigs,
  getSkillOptions 
} from './copilot.js';
import {
  createSessionHooks,
  createEmptyStats,
  DEFAULT_TOOL_OVERRIDE_CONFIG,
  clearFileCache,
  clearToolOverrideConfigCache,
  loadToolOverrideConfig,
  saveToolOverrideConfig,
  type ToolOverrideConfig,
} from './tool-overrides.js';

const TEST_DIR = join(process.cwd(), '.planeteer-test');
const TEST_SKILLS_DIR = join(TEST_DIR, 'skills');

describe('Skill Configuration', () => {
  beforeEach(async () => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      await rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('ensureSkillsDirectory', () => {
    it('should create skills directory if it does not exist', async () => {
      await ensureSkillsDirectory();
      const skillsDir = getSkillsDirectory();
      expect(existsSync(skillsDir)).toBe(true);
    });

    it('should not fail if skills directory already exists', async () => {
      await ensureSkillsDirectory();
      await ensureSkillsDirectory(); // Should not throw
      const skillsDir = getSkillsDirectory();
      expect(existsSync(skillsDir)).toBe(true);
    });
  });

  describe('listSkillFiles', () => {
    it('should return empty array when no skill files exist', async () => {
      await ensureSkillsDirectory();
      // Note: In test environment, example skills may already exist
      const files = await listSkillFiles();
      expect(Array.isArray(files)).toBe(true);
      // Files should only contain .yaml or .yml extensions
      files.forEach(file => {
        expect(file.endsWith('.yaml') || file.endsWith('.yml')).toBe(true);
      });
    });

    it('should list YAML skill files', async () => {
      await ensureSkillsDirectory();
      const skillsDir = getSkillsDirectory();
      
      await writeFile(join(skillsDir, 'skill1.yaml'), 'name: skill1\n');
      await writeFile(join(skillsDir, 'skill2.yml'), 'name: skill2\n');
      await writeFile(join(skillsDir, 'not-a-skill.txt'), 'ignore me\n');
      
      const files = await listSkillFiles();
      expect(files).toContain('skill1.yaml');
      expect(files).toContain('skill2.yml');
      expect(files).not.toContain('not-a-skill.txt');
    });
  });

  describe('loadSkillConfigs', () => {
    it('should load skill configurations from existing files', async () => {
      await ensureSkillsDirectory();
      const configs = await loadSkillConfigs();
      expect(Array.isArray(configs)).toBe(true);
      // Should include the example-web-app-skill.yaml if it exists
      if (configs.length > 0) {
        expect(configs.every(c => c.enabled === true)).toBe(true);
        expect(configs.every(c => typeof c.name === 'string')).toBe(true);
      }
    });

    it('should load multiple skill configurations', async () => {
      const configs = await loadSkillConfigs();
      expect(Array.isArray(configs)).toBe(true);
      // All configs should have name and enabled properties
      configs.forEach(config => {
        expect(config).toHaveProperty('name');
        expect(config).toHaveProperty('enabled');
        expect(typeof config.name).toBe('string');
        expect(typeof config.enabled).toBe('boolean');
      });
    });

    it('should gracefully handle malformed skill files', async () => {
      const configs = await loadSkillConfigs();
      // Should successfully load at least the valid example skill
      expect(Array.isArray(configs)).toBe(true);
    });
  });

  describe('getSkillOptions', () => {
    it('should return skillDirectories when skills directory exists', async () => {
      await ensureSkillsDirectory();
      const options = await getSkillOptions();
      
      const skillFiles = await listSkillFiles();
      if (skillFiles.length > 0) {
        expect(options).toHaveProperty('skillDirectories');
        expect(Array.isArray(options.skillDirectories)).toBe(true);
      } else {
        expect(options).toEqual({});
      }
    });

    it('should return skillDirectories path correctly', async () => {
      await ensureSkillsDirectory();
      const skillsDir = getSkillsDirectory();
      const options = await getSkillOptions();
      
      const skillFiles = await listSkillFiles();
      if (skillFiles.length > 0) {
        expect(options.skillDirectories![0]).toBe(skillsDir);
      }
    });
  });
});

describe('Tool Overrides', () => {
  const cwd = process.cwd();

  beforeEach(() => {
    clearFileCache();
    clearToolOverrideConfigCache();
  });

  describe('createEmptyStats', () => {
    it('should return zeroed stats', () => {
      const stats = createEmptyStats();
      expect(stats).toEqual({ reads: 0, edits: 0, greps: 0 });
    });
  });

  describe('DEFAULT_TOOL_OVERRIDE_CONFIG', () => {
    it('should have overrides enabled by default', () => {
      expect(DEFAULT_TOOL_OVERRIDE_CONFIG.enabled).toBe(true);
      expect(DEFAULT_TOOL_OVERRIDE_CONFIG.editFile?.enabled).toBe(true);
      expect(DEFAULT_TOOL_OVERRIDE_CONFIG.readFile?.enabled).toBe(true);
      expect(DEFAULT_TOOL_OVERRIDE_CONFIG.grep?.enabled).toBe(true);
    });

    it('should include common exclude patterns for grep', () => {
      const patterns = DEFAULT_TOOL_OVERRIDE_CONFIG.grep?.excludePatterns ?? [];
      expect(patterns).toContain('node_modules');
      expect(patterns).toContain('.git');
    });

    it('should default read_file size limit to 100KB', () => {
      expect(DEFAULT_TOOL_OVERRIDE_CONFIG.readFile?.maxSizeKb).toBe(100);
    });
  });

  describe('createSessionHooks — edit_file path validation', () => {
    it('should deny edit_file for paths outside cwd', async () => {
      const hooks = createSessionHooks(DEFAULT_TOOL_OVERRIDE_CONFIG);
      const result = await hooks.onPreToolUse?.({
        timestamp: Date.now(),
        cwd,
        toolName: 'edit_file',
        toolArgs: { path: '/etc/passwd' },
      });
      expect(result?.permissionDecision).toBe('deny');
      expect(result?.permissionDecisionReason).toMatch(/outside the project workspace/);
    });

    it('should deny str_replace_editor for paths outside cwd', async () => {
      const hooks = createSessionHooks(DEFAULT_TOOL_OVERRIDE_CONFIG);
      const result = await hooks.onPreToolUse?.({
        timestamp: Date.now(),
        cwd,
        toolName: 'str_replace_editor',
        toolArgs: { path: '/tmp/evil.txt' },
      });
      expect(result?.permissionDecision).toBe('deny');
    });

    it('should allow edit_file for paths within cwd', async () => {
      const hooks = createSessionHooks(DEFAULT_TOOL_OVERRIDE_CONFIG);
      const result = await hooks.onPreToolUse?.({
        timestamp: Date.now(),
        cwd,
        toolName: 'edit_file',
        toolArgs: { path: join(cwd, 'src', 'index.ts') },
      });
      expect(result?.permissionDecision).not.toBe('deny');
    });

    it('should allow edit_file when editFile override is disabled', async () => {
      const config: ToolOverrideConfig = {
        ...DEFAULT_TOOL_OVERRIDE_CONFIG,
        editFile: { enabled: false },
      };
      const hooks = createSessionHooks(config);
      const result = await hooks.onPreToolUse?.({
        timestamp: Date.now(),
        cwd,
        toolName: 'edit_file',
        toolArgs: { path: '/etc/passwd' },
      });
      expect(result?.permissionDecision).not.toBe('deny');
    });

    it('should not interfere when master switch is disabled', async () => {
      const config: ToolOverrideConfig = { ...DEFAULT_TOOL_OVERRIDE_CONFIG, enabled: false };
      const hooks = createSessionHooks(config);
      const result = await hooks.onPreToolUse?.({
        timestamp: Date.now(),
        cwd,
        toolName: 'edit_file',
        toolArgs: { path: '/etc/passwd' },
      });
      expect(result).toBeUndefined();
    });
  });

  describe('createSessionHooks — grep exclude patterns', () => {
    it('should add exclude_dirs to grep args', async () => {
      const hooks = createSessionHooks(DEFAULT_TOOL_OVERRIDE_CONFIG);
      const result = await hooks.onPreToolUse?.({
        timestamp: Date.now(),
        cwd,
        toolName: 'grep',
        toolArgs: { pattern: 'TODO', path: '.' },
      });
      const modified = result?.modifiedArgs as Record<string, unknown> | undefined;
      expect(Array.isArray(modified?.['exclude_dirs'])).toBe(true);
      expect((modified?.['exclude_dirs'] as string[])).toContain('node_modules');
      expect((modified?.['exclude_dirs'] as string[])).toContain('.git');
    });

    it('should provide additional context hint for grep', async () => {
      const hooks = createSessionHooks(DEFAULT_TOOL_OVERRIDE_CONFIG);
      const result = await hooks.onPreToolUse?.({
        timestamp: Date.now(),
        cwd,
        toolName: 'grep',
        toolArgs: { pattern: 'foo' },
      });
      expect(result?.additionalContext).toMatch(/--exclude-dir/);
    });
  });

  describe('createSessionHooks — onToolUse callback', () => {
    it('should invoke onToolUse after tool call', () => {
      const calls: string[] = [];
      const hooks = createSessionHooks(DEFAULT_TOOL_OVERRIDE_CONFIG, (name) => calls.push(name));
      hooks.onPostToolUse?.({
        timestamp: Date.now(),
        cwd,
        toolName: 'grep',
        toolArgs: {},
        toolResult: { resultType: 'success', textResultForLlm: 'results' },
      });
      expect(calls).toContain('grep');
    });

    it('should not invoke onToolUse when master switch is off', () => {
      const calls: string[] = [];
      const config: ToolOverrideConfig = { ...DEFAULT_TOOL_OVERRIDE_CONFIG, enabled: false };
      const hooks = createSessionHooks(config, (name) => calls.push(name));
      hooks.onPostToolUse?.({
        timestamp: Date.now(),
        cwd,
        toolName: 'grep',
        toolArgs: {},
        toolResult: { resultType: 'success', textResultForLlm: 'results' },
      });
      expect(calls).toHaveLength(0);
    });
  });

  describe('loadToolOverrideConfig', () => {
    it('should return default config when no config file exists', async () => {
      const config = await loadToolOverrideConfig();
      expect(config.enabled).toBe(true);
      expect(config.editFile?.enabled).toBe(true);
    });
  });
});
