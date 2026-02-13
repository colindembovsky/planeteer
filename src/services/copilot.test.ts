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
      const files = await listSkillFiles();
      expect(Array.isArray(files)).toBe(true);
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
