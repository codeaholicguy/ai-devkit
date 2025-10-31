import {
  ENVIRONMENT_DEFINITIONS,
  ALL_ENVIRONMENT_CODES,
  getAllEnvironments,
  getEnvironment,
  getAllEnvironmentCodes,
  getEnvironmentsByCodes,
  isValidEnvironmentCode,
  getEnvironmentDisplayName,
  validateEnvironmentCodes
} from '../../util/env';
import { EnvironmentCode } from '../../types';

describe('Environment Utilities', () => {
  describe('ENVIRONMENT_DEFINITIONS', () => {
    it('should contain all 10 environment definitions', () => {
      expect(Object.keys(ENVIRONMENT_DEFINITIONS)).toHaveLength(10);
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
    });

    it('should have correct structure for cursor environment', () => {
      const cursor = ENVIRONMENT_DEFINITIONS.cursor;
      expect(cursor).toEqual({
        code: 'cursor',
        name: 'Cursor',
        contextFileName: 'AGENTS.md',
        commandPath: '.cursor/commands'
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
    it('should contain all 10 environment codes', () => {
      expect(ALL_ENVIRONMENT_CODES).toHaveLength(10);
      expect(ALL_ENVIRONMENT_CODES).toEqual(
        expect.arrayContaining([
          'cursor', 'claude', 'github', 'gemini', 'codex',
          'windsurf', 'kilocode', 'amp', 'opencode', 'roo'
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
      expect(environments).toHaveLength(10);
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
      expect(codes).toHaveLength(10);
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
});
