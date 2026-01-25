import { validateRegistryId, validateSkillName } from '../../util/skill';

describe('Skill Validation Utilities', () => {
  describe('validateRegistryId', () => {
    describe('valid registry IDs', () => {
      it('should accept valid org/repo format', () => {
        expect(() => validateRegistryId('anthropics/skills')).not.toThrow();
        expect(() => validateRegistryId('vercel-labs/agent-skills')).not.toThrow();
        expect(() => validateRegistryId('my-org/my-repo')).not.toThrow();
      });

      it('should accept alphanumeric characters', () => {
        expect(() => validateRegistryId('org123/repo456')).not.toThrow();
        expect(() => validateRegistryId('ABC/XYZ')).not.toThrow();
      });

      it('should accept hyphens and underscores', () => {
        expect(() => validateRegistryId('my-org/my-repo')).not.toThrow();
        expect(() => validateRegistryId('my_org/my_repo')).not.toThrow();
        expect(() => validateRegistryId('my-org_2/my-repo_3')).not.toThrow();
      });
    });

    describe('invalid registry IDs', () => {
      it('should reject missing slash', () => {
        expect(() => validateRegistryId('anthropics-skills')).toThrow(
          'Invalid registry ID format: "anthropics-skills". Expected format: "org/repo"'
        );
      });

      it('should reject multiple slashes', () => {
        expect(() => validateRegistryId('org/sub/repo')).toThrow(
          'Invalid registry ID format'
        );
      });

      it('should reject empty org or repo', () => {
        expect(() => validateRegistryId('/repo')).toThrow('Invalid registry ID format');
        expect(() => validateRegistryId('org/')).toThrow('Invalid registry ID format');
        expect(() => validateRegistryId('/')).toThrow('Invalid registry ID format');
      });

      it('should reject path traversal attempts', () => {
        expect(() => validateRegistryId('../malicious/repo')).toThrow();
        expect(() => validateRegistryId('org/../repo')).toThrow();
        expect(() => validateRegistryId('org/repo/..')).toThrow();
      });

      it('should reject tilde character', () => {
        expect(() => validateRegistryId('~/repo')).toThrow();
        expect(() => validateRegistryId('org/~repo')).toThrow();
      });

      it('should reject special characters', () => {
        expect(() => validateRegistryId('org/repo!')).toThrow('Invalid registry ID format');
        expect(() => validateRegistryId('org@example/repo')).toThrow('Invalid registry ID format');
        expect(() => validateRegistryId('org/repo#main')).toThrow('Invalid registry ID format');
        expect(() => validateRegistryId('org/repo?query')).toThrow('Invalid registry ID format');
      });

      it('should reject empty string', () => {
        expect(() => validateRegistryId('')).toThrow('Invalid registry ID format');
      });
    });
  });

  describe('validateSkillName', () => {
    describe('valid skill names', () => {
      it('should accept lowercase alphanumeric names', () => {
        expect(() => validateSkillName('frontend-design')).not.toThrow();
        expect(() => validateSkillName('backend-api')).not.toThrow();
        expect(() => validateSkillName('test123')).not.toThrow();
      });

      it('should accept hyphens between words', () => {
        expect(() => validateSkillName('multi-word-skill')).not.toThrow();
        expect(() => validateSkillName('a-b-c-d')).not.toThrow();
      });

      it('should accept single character names', () => {
        expect(() => validateSkillName('a')).not.toThrow();
        expect(() => validateSkillName('z')).not.toThrow();
        expect(() => validateSkillName('1')).not.toThrow();
      });

      it('should accept all lowercase letters', () => {
        expect(() => validateSkillName('abcdefghijklmnopqrstuvwxyz')).not.toThrow();
      });

      it('should accept all numbers', () => {
        expect(() => validateSkillName('0123456789')).not.toThrow();
      });

      it('should accept mix of lowercase and hyphens', () => {
        expect(() => validateSkillName('skill-name-2024')).not.toThrow();
      });
    });

    describe('invalid skill names', () => {
      it('should reject uppercase letters', () => {
        expect(() => validateSkillName('Frontend-Design')).toThrow(
          'Invalid skill name: "Frontend-Design". Must contain only lowercase letters, numbers, and hyphens.'
        );
        expect(() => validateSkillName('SKILL')).toThrow();
        expect(() => validateSkillName('Skill')).toThrow();
      });

      it('should reject names starting with hyphen', () => {
        expect(() => validateSkillName('-skill')).toThrow(
          'Skill name cannot start or end with a hyphen.'
        );
        expect(() => validateSkillName('-frontend-design')).toThrow();
      });

      it('should reject names ending with hyphen', () => {
        expect(() => validateSkillName('skill-')).toThrow(
          'Skill name cannot start or end with a hyphen.'
        );
        expect(() => validateSkillName('frontend-design-')).toThrow();
      });

      it('should reject consecutive hyphens', () => {
        expect(() => validateSkillName('skill--name')).toThrow(
          'Skill name cannot contain consecutive hyphens.'
        );
        expect(() => validateSkillName('a--b--c')).toThrow();
        expect(() => validateSkillName('test---123')).toThrow();
      });

      it('should reject special characters', () => {
        expect(() => validateSkillName('skill_name')).toThrow(
          'Must contain only lowercase letters, numbers, and hyphens.'
        );
        expect(() => validateSkillName('skill.name')).toThrow();
        expect(() => validateSkillName('skill@name')).toThrow();
        expect(() => validateSkillName('skill/name')).toThrow();
        expect(() => validateSkillName('skill name')).toThrow();
      });

      it('should reject empty string', () => {
        expect(() => validateSkillName('')).toThrow(
          'Must contain only lowercase letters, numbers, and hyphens.'
        );
      });

      it('should reject path traversal attempts', () => {
        expect(() => validateSkillName('../skill')).toThrow();
        expect(() => validateSkillName('skill/../other')).toThrow();
      });
    });

    describe('edge cases', () => {
      it('should handle skill names with multiple validation issues', () => {
        expect(() => validateSkillName('-Skill--Name-')).toThrow();
        expect(() => validateSkillName('--skill')).toThrow();
        expect(() => validateSkillName('SKILL--')).toThrow();
      });

      it('should provide clear error messages', () => {
        try {
          validateSkillName('Invalid@Skill');
          fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.message).toContain('Must contain only lowercase letters');
        }

        try {
          validateSkillName('-skill');
          fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.message).toContain('cannot start or end with a hyphen');
        }

        try {
          validateSkillName('skill--name');
          fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.message).toContain('cannot contain consecutive hyphens');
        }
      });
    });
  });
});