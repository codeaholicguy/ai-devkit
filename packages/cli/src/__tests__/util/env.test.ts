import {
  ENVIRONMENT_DEFINITIONS,
  ALL_ENVIRONMENT_CODES,
  getAllEnvironments,
  getEnvironment,
  getAllEnvironmentCodes,
  getEnvironmentsByCodes,
  isValidEnvironmentCode,
  getEnvironmentDisplayName,
  validateEnvironmentCodes,
  getGlobalCapableEnvironments,
  hasGlobalSupport,
  getSkillPath,
  getSkillCapableEnvironments
} from '../../util/env';
import { EnvironmentCode } from '../../types';

describe('Environment Utilities', () => {
  describe('ENVIRONMENT_DEFINITIONS', () => {
    it('should contain all all environment definitions', () => {
      expect(Object.keys(ENVIRONMENT_DEFINITIONS)).toHaveLength(11);
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('cursor');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('claude');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('github');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('gemini');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('codex');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('windsurf');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('kilocode');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('amp');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('opencode');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('roo');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('antigravity');
    });

    it('should have correct structure for cursor environment', () => {
      const cursor = ENVIRONMENT_DEFINITIONS.cursor;
      expect(cursor).toEqual({
        code: 'cursor',
        name: 'Cursor',
        contextFileName: 'AGENTS.md',
        commandPath: '.cursor/commands',
        skillPath: '.cursor/skills'
      });
    });

    it('should have consistent structure across all environments', () => {
      Object.values(ENVIRONMENT_DEFINITIONS).forEach(env => {
        expect(env).toHaveProperty('code');
        expect(env).toHaveProperty('name');
        expect(env).toHaveProperty('contextFileName');
        expect(env).toHaveProperty('commandPath');
        expect(typeof env.code).toBe('string');
        expect(typeof env.name).toBe('string');
        expect(typeof env.contextFileName).toBe('string');
        expect(typeof env.commandPath).toBe('string');
      });
    });
  });

  describe('ALL_ENVIRONMENT_CODES', () => {
    it('should contain all all environment codes', () => {
      expect(ALL_ENVIRONMENT_CODES).toHaveLength(11);
      expect(ALL_ENVIRONMENT_CODES).toEqual(
        expect.arrayContaining([
          'cursor', 'claude', 'github', 'gemini', 'codex',
          'windsurf', 'kilocode', 'amp', 'opencode', 'roo', 'antigravity'
        ])
      );
    });

    it('should be dynamically generated from ENVIRONMENT_DEFINITIONS keys', () => {
      const expectedCodes = Object.keys(ENVIRONMENT_DEFINITIONS) as EnvironmentCode[];
      expect(ALL_ENVIRONMENT_CODES).toEqual(expectedCodes);
    });
  });

  describe('getAllEnvironments', () => {
    it('should return all environment definitions', () => {
      const environments = getAllEnvironments();
      expect(environments).toHaveLength(11);
      expect(environments).toEqual(Object.values(ENVIRONMENT_DEFINITIONS));
    });

    it('should return different array instances', () => {
      const envs1 = getAllEnvironments();
      const envs2 = getAllEnvironments();
      expect(envs1).not.toBe(envs2);
      expect(envs1).toEqual(envs2);
    });
  });

  describe('getEnvironment', () => {
    it('should return correct environment definition for valid codes', () => {
      const cursor = getEnvironment('cursor');
      expect(cursor).toBeDefined();
      expect(cursor?.code).toBe('cursor');
      expect(cursor?.name).toBe('Cursor');

      const claude = getEnvironment('claude');
      expect(claude).toBeDefined();
      expect(claude?.code).toBe('claude');
      expect(claude?.name).toBe('Claude Code');
    });

    it('should return undefined for invalid codes', () => {
      const invalid = getEnvironment('invalid' as EnvironmentCode);
      expect(invalid).toBeUndefined();
    });

    it('should return the same reference for repeated calls', () => {
      const env1 = getEnvironment('cursor');
      const env2 = getEnvironment('cursor');
      expect(env1).toBe(env2);
    });
  });

  describe('getAllEnvironmentCodes', () => {
    it('should return all environment codes', () => {
      const codes = getAllEnvironmentCodes();
      expect(codes).toEqual(ALL_ENVIRONMENT_CODES);
    });

    it('should return different array instances', () => {
      const codes1 = getAllEnvironmentCodes();
      const codes2 = getAllEnvironmentCodes();
      expect(codes1).not.toBe(codes2);
      expect(codes1).toEqual(codes2);
    });
  });

  describe('getEnvironmentsByCodes', () => {
    it('should return correct environments for valid codes', () => {
      const environments = getEnvironmentsByCodes(['cursor', 'claude']);
      expect(environments).toHaveLength(2);
      expect(environments[0].code).toBe('cursor');
      expect(environments[1].code).toBe('claude');
    });

    it('should filter out invalid codes', () => {
      const environments = getEnvironmentsByCodes(['cursor', 'invalid' as EnvironmentCode, 'claude']);
      expect(environments).toHaveLength(2);
      expect(environments[0].code).toBe('cursor');
      expect(environments[1].code).toBe('claude');
    });

    it('should return empty array for empty input', () => {
      const environments = getEnvironmentsByCodes([]);
      expect(environments).toHaveLength(0);
    });

    it('should return empty array for all invalid codes', () => {
      const environments = getEnvironmentsByCodes(['invalid1' as EnvironmentCode, 'invalid2' as EnvironmentCode]);
      expect(environments).toHaveLength(0);
    });
  });

  describe('isValidEnvironmentCode', () => {
    it('should return true for valid environment codes', () => {
      expect(isValidEnvironmentCode('cursor')).toBe(true);
      expect(isValidEnvironmentCode('claude')).toBe(true);
      expect(isValidEnvironmentCode('roo')).toBe(true);
      expect(isValidEnvironmentCode('antigravity')).toBe(true);
    });

    it('should return false for invalid codes', () => {
      expect(isValidEnvironmentCode('invalid')).toBe(false);
      expect(isValidEnvironmentCode('')).toBe(false);
      expect(isValidEnvironmentCode('CURSOR')).toBe(false);
    });
  });

  describe('getEnvironmentDisplayName', () => {
    it('should return environment name for valid codes', () => {
      expect(getEnvironmentDisplayName('cursor')).toBe('Cursor');
      expect(getEnvironmentDisplayName('claude')).toBe('Claude Code');
      expect(getEnvironmentDisplayName('roo')).toBe('Roo Code');
      expect(getEnvironmentDisplayName('antigravity')).toBe('Antigravity');
    });

    it('should return code itself for invalid codes', () => {
      expect(getEnvironmentDisplayName('invalid' as EnvironmentCode)).toBe('invalid');
    });
  });

  describe('validateEnvironmentCodes', () => {
    it('should return valid codes array for all valid inputs', () => {
      const result = validateEnvironmentCodes(['cursor', 'claude']);
      expect(result).toEqual(['cursor', 'claude']);
    });

    it('should throw error for invalid codes', () => {
      expect(() => {
        validateEnvironmentCodes(['cursor', 'invalid']);
      }).toThrow('Invalid environment codes: invalid');
    });

    it('should throw error with multiple invalid codes', () => {
      expect(() => {
        validateEnvironmentCodes(['cursor', 'invalid1', 'invalid2']);
      }).toThrow('Invalid environment codes: invalid1, invalid2');
    });

    it('should return empty array for empty input', () => {
      const result = validateEnvironmentCodes([]);
      expect(result).toEqual([]);
    });
  });

  describe('getGlobalCapableEnvironments', () => {
    it('should return only environments with globalCommandPath defined', () => {
      const globalEnvs = getGlobalCapableEnvironments();

      // Currently only Antigravity and Codex have global support
      expect(globalEnvs.length).toBeGreaterThan(0);
      globalEnvs.forEach(env => {
        expect(env.globalCommandPath).toBeDefined();
        expect(typeof env.globalCommandPath).toBe('string');
      });
    });

    it('should include Antigravity in global-capable environments', () => {
      const globalEnvs = getGlobalCapableEnvironments();
      const antigravity = globalEnvs.find(env => env.code === 'antigravity');

      expect(antigravity).toBeDefined();
      expect(antigravity?.globalCommandPath).toBe('.gemini/antigravity/global_workflows');
    });

    it('should include Codex in global-capable environments', () => {
      const globalEnvs = getGlobalCapableEnvironments();
      const codex = globalEnvs.find(env => env.code === 'codex');

      expect(codex).toBeDefined();
      expect(codex?.globalCommandPath).toBe('.codex/prompts');
    });

    it('should not include environments without globalCommandPath', () => {
      const globalEnvs = getGlobalCapableEnvironments();
      const envCodes = globalEnvs.map(env => env.code);

      // Cursor should not be in the list (no global support)
      expect(envCodes).not.toContain('cursor');
      expect(envCodes).not.toContain('claude');
      expect(envCodes).not.toContain('github');
    });

    it('should return exactly 2 environments (Antigravity and Codex)', () => {
      const globalEnvs = getGlobalCapableEnvironments();
      expect(globalEnvs).toHaveLength(2);
    });
  });

  describe('hasGlobalSupport', () => {
    it('should return true for Antigravity', () => {
      expect(hasGlobalSupport('antigravity')).toBe(true);
    });

    it('should return true for Codex', () => {
      expect(hasGlobalSupport('codex')).toBe(true);
    });

    it('should return false for Cursor (no global support)', () => {
      expect(hasGlobalSupport('cursor')).toBe(false);
    });

    it('should return false for Claude (no global support)', () => {
      expect(hasGlobalSupport('claude')).toBe(false);
    });

    it('should return false for GitHub Copilot (no global support)', () => {
      expect(hasGlobalSupport('github')).toBe(false);
    });

    it('should return false for Gemini (no global support)', () => {
      expect(hasGlobalSupport('gemini')).toBe(false);
    });

    it('should return false for invalid environment code', () => {
      expect(hasGlobalSupport('invalid' as EnvironmentCode)).toBe(false);
    });
  });

  describe('getSkillPath', () => {
    it('should return skill path for cursor', () => {
      expect(getSkillPath('cursor')).toBe('.cursor/skills');
    });

    it('should return skill path for claude', () => {
      expect(getSkillPath('claude')).toBe('.claude/skills');
    });

    it('should return undefined for environments without skill support', () => {
      expect(getSkillPath('windsurf')).toBeUndefined();
      expect(getSkillPath('gemini')).toBeUndefined();
      expect(getSkillPath('github')).toBeUndefined();
    });

    it('should return undefined for invalid environment code', () => {
      expect(getSkillPath('invalid' as EnvironmentCode)).toBeUndefined();
    });
  });

  describe('getSkillCapableEnvironments', () => {
    it('should return only environments with skillPath defined', () => {
      const skillEnvs = getSkillCapableEnvironments();

      expect(skillEnvs.length).toBeGreaterThan(0);
      skillEnvs.forEach(env => {
        expect(env.skillPath).toBeDefined();
        expect(typeof env.skillPath).toBe('string');
      });
    });

    it('should include cursor in skill-capable environments', () => {
      const skillEnvs = getSkillCapableEnvironments();
      const cursor = skillEnvs.find(env => env.code === 'cursor');

      expect(cursor).toBeDefined();
      expect(cursor?.skillPath).toBe('.cursor/skills');
    });

    it('should include claude in skill-capable environments', () => {
      const skillEnvs = getSkillCapableEnvironments();
      const claude = skillEnvs.find(env => env.code === 'claude');

      expect(claude).toBeDefined();
      expect(claude?.skillPath).toBe('.claude/skills');
    });

    it('should not include environments without skillPath', () => {
      const skillEnvs = getSkillCapableEnvironments();
      const envCodes = skillEnvs.map(env => env.code);

      // These environments don't have skillPath configured
      expect(envCodes).not.toContain('windsurf');
      expect(envCodes).not.toContain('gemini');
      expect(envCodes).not.toContain('github');
      expect(envCodes).not.toContain('kilocode');
      expect(envCodes).not.toContain('amp');
      expect(envCodes).not.toContain('roo');
    });

    it('should return environments with skillPath configured', () => {
      const skillEnvs = getSkillCapableEnvironments();
      const envCodes = skillEnvs.map(env => env.code);

      // These environments have skillPath configured
      expect(envCodes).toContain('cursor');
      expect(envCodes).toContain('claude');
      expect(envCodes).toContain('codex');
      expect(envCodes).toContain('opencode');
      expect(envCodes).toContain('antigravity');
      expect(skillEnvs).toHaveLength(5);
    });
  });
});
