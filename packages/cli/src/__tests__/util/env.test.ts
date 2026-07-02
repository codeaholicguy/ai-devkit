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
  hasMcpSupport,
  getSkillPath,
  getGlobalSkillPath,
  getSkillCapableEnvironments,
  getMcpConfigPath
} from '../../util/env.js';
import { EnvironmentCode } from '../../types.js';

describe('Environment Utilities', () => {
  describe('ENVIRONMENT_DEFINITIONS', () => {
    it('should contain all all environment definitions', () => {
      expect(Object.keys(ENVIRONMENT_DEFINITIONS)).toHaveLength(16);
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('cursor');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('claude');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('github');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('gemini');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('grok');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('codex');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('kilocode');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('amp');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('opencode');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('roo');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('antigravity');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('antigravity-cli');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('junie');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('cline');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('devin');
      expect(ENVIRONMENT_DEFINITIONS).toHaveProperty('pi');
    });

    it('should have correct structure for cursor environment', () => {
      const cursor = ENVIRONMENT_DEFINITIONS.cursor;
      expect(cursor).toEqual({
        code: 'cursor',
        name: 'Cursor',
        skillPath: '.cursor/skills',
        globalSkillPath: '.cursor/skills'
      });
    });

    it('should have consistent structure across all environments', () => {
      Object.values(ENVIRONMENT_DEFINITIONS).forEach(env => {
        expect(env).toHaveProperty('code');
        expect(env).toHaveProperty('name');
        expect(env).not.toHaveProperty('contextFileName');
        expect(env).not.toHaveProperty('commandPath');
        expect(env).not.toHaveProperty('globalCommandPath');
        expect(env).not.toHaveProperty('customCommandExtension');
        expect(env).not.toHaveProperty('isCustomCommandPath');
        expect(typeof env.code).toBe('string');
        expect(typeof env.name).toBe('string');
      });
    });
  });

  describe('ALL_ENVIRONMENT_CODES', () => {
    it('should contain all all environment codes', () => {
      expect(ALL_ENVIRONMENT_CODES).toHaveLength(16);
      expect(ALL_ENVIRONMENT_CODES).toEqual(
        expect.arrayContaining([
          'cursor', 'claude', 'github', 'gemini', 'grok', 'codex',
          'kilocode', 'amp', 'opencode', 'roo', 'antigravity',
          'junie', 'cline', 'devin', 'pi'
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
      expect(environments).toHaveLength(16);
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
      expect(isValidEnvironmentCode('junie')).toBe(true);
      expect(isValidEnvironmentCode('cline')).toBe(true);
      expect(isValidEnvironmentCode('devin')).toBe(true);
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
      expect(getEnvironmentDisplayName('junie')).toBe('Junie');
      expect(getEnvironmentDisplayName('cline')).toBe('Cline');
      expect(getEnvironmentDisplayName('devin')).toBe('Devin');
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

  describe('getSkillPath', () => {
    it('should return skill path for cursor', () => {
      expect(getSkillPath('cursor')).toBe('.cursor/skills');
    });

    it('should return skill path for claude', () => {
      expect(getSkillPath('claude')).toBe('.claude/skills');
    });

    it('should return skill path for github copilot', () => {
      expect(getSkillPath('github')).toBe('.github/skills');
    });

    it('should return skill path for gemini', () => {
      expect(getSkillPath('gemini')).toBe('.gemini/skills');
    });

    it('should return skill path for junie', () => {
      expect(getSkillPath('junie')).toBe('.junie/skills');
    });

    it('should return skill path for cline', () => {
      expect(getSkillPath('cline')).toBe('.cline/skills');
    });

    it('should return skill path for devin', () => {
      expect(getSkillPath('devin')).toBe('.devin/skills');
    });

    it('should return skill path for roo', () => {
      expect(getSkillPath('roo')).toBe('.roo/skills');
    });

    it('should return skill path for kilocode', () => {
      expect(getSkillPath('kilocode')).toBe('.kilo/skills');
    });

    it('should return skill path for pi', () => {
      expect(getSkillPath('pi')).toBe('.pi/skills');
    });

    it('should return undefined for invalid environment code', () => {
      expect(getSkillPath('invalid' as EnvironmentCode)).toBeUndefined();
    });
  });

  describe('getGlobalSkillPath', () => {
    it('should return global skill path for cursor', () => {
      expect(getGlobalSkillPath('cursor')).toBe('.cursor/skills');
    });

    it('should return global skill path for codex', () => {
      expect(getGlobalSkillPath('codex')).toBe('.codex/skills');
    });

    it('should return global skill path for gemini', () => {
      expect(getGlobalSkillPath('gemini')).toBe('.gemini/skills');
    });

    it('should return global skill path for github copilot', () => {
      expect(getGlobalSkillPath('github')).toBe('.copilot/skills');
    });

    it('should return global skill path for junie', () => {
      expect(getGlobalSkillPath('junie')).toBe('.junie/skills');
    });

    it('should return global skill path for cline', () => {
      expect(getGlobalSkillPath('cline')).toBe('.cline/skills');
    });

    it('should return global skill path for roo', () => {
      expect(getGlobalSkillPath('roo')).toBe('.roo/skills');
    });

    it('should return global skill path for devin', () => {
      expect(getGlobalSkillPath('devin')).toBe('.config/devin/skills');
    });

    it('should return global skill path for kilocode', () => {
      expect(getGlobalSkillPath('kilocode')).toBe('.kilo/skills');
    });

    it('should return global skill path for pi', () => {
      expect(getGlobalSkillPath('pi')).toBe('.pi/agent/skills');
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

    it('should include gemini in skill-capable environments', () => {
      const skillEnvs = getSkillCapableEnvironments();
      const gemini = skillEnvs.find(env => env.code === 'gemini');

      expect(gemini).toBeDefined();
      expect(gemini?.skillPath).toBe('.gemini/skills');
    });

    it('should include roo in skill-capable environments', () => {
      const skillEnvs = getSkillCapableEnvironments();
      const roo = skillEnvs.find(env => env.code === 'roo');

      expect(roo).toBeDefined();
      expect(roo?.skillPath).toBe('.roo/skills');
    });

    it('should include kilocode in skill-capable environments', () => {
      const skillEnvs = getSkillCapableEnvironments();
      const kilocode = skillEnvs.find(env => env.code === 'kilocode');

      expect(kilocode).toBeDefined();
      expect(kilocode?.skillPath).toBe('.kilo/skills');
    });

    it('should include pi in skill-capable environments', () => {
      const skillEnvs = getSkillCapableEnvironments();
      const pi = skillEnvs.find(env => env.code === 'pi');

      expect(pi).toBeDefined();
      expect(pi?.skillPath).toBe('.pi/skills');
    });

    it('should return environments with skillPath configured', () => {
      const skillEnvs = getSkillCapableEnvironments();
      const envCodes = skillEnvs.map(env => env.code);

      // These environments have skillPath configured
      expect(envCodes).toContain('cursor');
      expect(envCodes).toContain('claude');
      expect(envCodes).toContain('github');
      expect(envCodes).toContain('gemini');
      expect(envCodes).toContain('codex');
      expect(envCodes).toContain('kilocode');
      expect(envCodes).toContain('amp');
      expect(envCodes).toContain('opencode');
      expect(envCodes).toContain('roo');
      expect(envCodes).toContain('antigravity');
      expect(envCodes).toContain('junie');
      expect(envCodes).toContain('cline');
      expect(envCodes).toContain('devin');
      expect(envCodes).toContain('pi');
      expect(skillEnvs).toHaveLength(16);
    });
  });

  describe('MCP support', () => {
    it('should return MCP config path for github copilot', () => {
      expect(hasMcpSupport('github')).toBe(true);
      expect(getMcpConfigPath('github')).toBe('.mcp.json');
    });

    it('should return MCP config path for devin', () => {
      expect(hasMcpSupport('devin')).toBe(true);
      expect(getMcpConfigPath('devin')).toBe('.devin/config.json');
    });

    it('should return MCP config path for roo', () => {
      expect(hasMcpSupport('roo')).toBe(true);
      expect(getMcpConfigPath('roo')).toBe('.roo/mcp.json');
    });

    it('should return MCP config path for kilocode', () => {
      expect(hasMcpSupport('kilocode')).toBe(true);
      expect(getMcpConfigPath('kilocode')).toBe('.kilo/kilo.jsonc');
    });

    it('should return MCP config path for opencode', () => {
      expect(hasMcpSupport('opencode')).toBe(true);
      expect(getMcpConfigPath('opencode')).toBe('opencode.json');
    });
  });

});
