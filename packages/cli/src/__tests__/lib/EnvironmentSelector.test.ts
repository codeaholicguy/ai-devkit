import type { MockedFunction } from 'vitest';
import { checkbox, confirm } from '@inquirer/prompts';
import { EnvironmentSelector } from '../../lib/EnvironmentSelector.js';
import {
  getAllEnvironments,
  getEnvironment,
  getGlobalSkillPath,
  getMcpConfigPath,
  getSkillPath,
  isValidEnvironmentCode,
} from '../../util/env.js';

vi.mock('@inquirer/prompts', () => ({
  checkbox: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('../../util/terminal-ui.js', () => ({
  ui: { warning: vi.fn(), info: vi.fn(), text: vi.fn(), breakline: vi.fn() },
}));
import { ui as mockUi } from '../../util/terminal-ui.js';

describe('EnvironmentSelector', () => {
  let selector: EnvironmentSelector;
  let mockCheckbox: MockedFunction<any>;
  let mockConfirm: MockedFunction<any>;

  beforeEach(() => {
    selector = new EnvironmentSelector();
    
    mockCheckbox = checkbox as MockedFunction<any>;
    mockConfirm = confirm as MockedFunction<any>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('selectEnvironments', () => {
    it('includes Junie with project skills, global skills, and MCP', () => {
      expect(isValidEnvironmentCode('junie')).toBe(true);
      expect(getEnvironment('junie')).toMatchObject({
        code: 'junie',
        name: 'Junie',
        skillPath: '.junie/skills',
        globalSkillPath: '.junie/skills',
        mcpConfigPath: '.junie/mcp/mcp.json',
      });
      expect(getSkillPath('junie')).toBe('.junie/skills');
      expect(getGlobalSkillPath('junie')).toBe('.junie/skills');
      expect(getMcpConfigPath('junie')).toBe('.junie/mcp/mcp.json');
    });

    it('includes Cline with project and global skill paths', () => {
      expect(isValidEnvironmentCode('cline')).toBe(true);
      expect(getEnvironment('cline')).toMatchObject({
        code: 'cline',
        name: 'Cline',
        skillPath: '.cline/skills',
        globalSkillPath: '.cline/skills',
      });
      expect(getSkillPath('cline')).toBe('.cline/skills');
      expect(getGlobalSkillPath('cline')).toBe('.cline/skills');
      expect(getMcpConfigPath('cline')).toBeUndefined();
    });

    it('includes GitHub Copilot with project skills, global skills, and MCP', () => {
      expect(getEnvironment('github')).toMatchObject({
        code: 'github',
        name: 'GitHub Copilot',
        skillPath: '.github/skills',
        globalSkillPath: '.copilot/skills',
        mcpConfigPath: '.mcp.json',
      });
      expect(getSkillPath('github')).toBe('.github/skills');
      expect(getGlobalSkillPath('github')).toBe('.copilot/skills');
      expect(getMcpConfigPath('github')).toBe('.mcp.json');
    });

    it('includes Devin with project skills, global skills, MCP', () => {
      expect(isValidEnvironmentCode('devin')).toBe(true);
      expect(getEnvironment('devin')).toMatchObject({
        code: 'devin',
        name: 'Devin',
        skillPath: '.devin/skills',
        globalSkillPath: '.config/devin/skills',
        mcpConfigPath: '.devin/config.json',
      });
      expect(getSkillPath('devin')).toBe('.devin/skills');
      expect(getGlobalSkillPath('devin')).toBe('.config/devin/skills');
      expect(getMcpConfigPath('devin')).toBe('.devin/config.json');
    });

    it('should create choices from all environments', async () => {
      const environments = getAllEnvironments();
      mockCheckbox.mockResolvedValue(['cursor', 'claude']);

      await selector.selectEnvironments();

      expect(mockCheckbox).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Select AI environments to set up (use space to select, enter to confirm):',
          choices: environments.map(env => ({
            name: env.name,
            value: env.code,
            short: env.name
          })),
          pageSize: 10,
          required: true
        })
      );
    });

    it('should return selected environments', async () => {
      const selectedEnvs = ['cursor', 'claude'];
      mockCheckbox.mockResolvedValue(selectedEnvs);

      const result = await selector.selectEnvironments();

      expect(result).toEqual(selectedEnvs);
    });

    it('should validate that at least one environment is selected', async () => {
      mockCheckbox.mockResolvedValue([]);

      const result = await selector.selectEnvironments();

      expect(result).toEqual([]);

      expect(mockCheckbox).toHaveBeenCalledWith(
        expect.objectContaining({ required: true })
      );
    });

    it('should handle prompt rejection', async () => {
      mockCheckbox.mockRejectedValue(new Error('User cancelled'));

      await expect(selector.selectEnvironments()).rejects.toThrow('User cancelled');
    });
  });

  describe('confirmOverride', () => {
    it('should return true immediately for empty conflicts', async () => {
      const result = await selector.confirmOverride([]);
      expect(result).toBe(true);
      expect(mockCheckbox).not.toHaveBeenCalled();
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('should prompt user for confirmation with conflict details', async () => {
      mockConfirm.mockResolvedValue(true);

      const result = await selector.confirmOverride(['cursor', 'claude']);

      expect(result).toBe(true);
      expect(mockConfirm).toHaveBeenCalledWith(
        {
          message: 'The following environments are already set up and will be overwritten:\n  Cursor, Claude Code\n\nDo you want to continue?',
          default: false
        }
      );
    });

    it('should return false when user declines', async () => {
      mockConfirm.mockResolvedValue(false);

      const result = await selector.confirmOverride(['cursor']);

      expect(result).toBe(false);
    });

    it('should handle single environment conflict', async () => {
      mockConfirm.mockResolvedValue(true);

      const result = await selector.confirmOverride(['cursor']);

      expect(result).toBe(true);
      const message = mockConfirm.mock.calls[0][0].message;
      expect(message).toContain('Cursor');
    });
  });


  describe('displaySelectionSummary', () => {
    it('should display nothing selected message for empty array', () => {
      selector.displaySelectionSummary([]);

      expect(mockUi.warning).toHaveBeenCalledWith('No environments selected.');
    });

    it('should display selected environments with checkmarks', () => {
      selector.displaySelectionSummary(['cursor', 'claude']);

      expect(mockUi.text).toHaveBeenCalledWith('\nSelected environments:');
      expect(mockUi.text).toHaveBeenCalledWith('  Cursor');
      expect(mockUi.text).toHaveBeenCalledWith('  Claude Code');
      expect(mockUi.breakline).toHaveBeenCalled();
    });

    it('should handle single environment selection', () => {
      selector.displaySelectionSummary(['cursor']);

      expect(mockUi.text).toHaveBeenCalledWith('\nSelected environments:');
      expect(mockUi.text).toHaveBeenCalledWith('  Cursor');
      expect(mockUi.breakline).toHaveBeenCalled();
    });
  });

  describe('selectGlobalSkillEnvironments', () => {
    it('should create choices from global-skill-capable environments', async () => {
      mockCheckbox.mockResolvedValue(['claude']);

      await selector.selectGlobalSkillEnvironments();

      expect(mockCheckbox).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Select AI environments for global skill installation (use space to select, enter to confirm):',
          choices: expect.arrayContaining([
            expect.objectContaining({ value: 'cursor' }),
            expect.objectContaining({ value: 'claude' }),
            expect.objectContaining({ value: 'github' }),
            expect.objectContaining({ value: 'codex' }),
            expect.objectContaining({ value: 'gemini' }),
            expect.objectContaining({ value: 'opencode' }),
            expect.objectContaining({ value: 'antigravity' }),
            expect.objectContaining({ value: 'junie' }),
            expect.objectContaining({ value: 'cline' }),
            expect.objectContaining({ value: 'devin' })
          ]),
          pageSize: 10,
          required: true
        })
      );
    });

    it('should return selected global-skill environments', async () => {
      const selectedEnvs = ['claude', 'codex'];
      mockCheckbox.mockResolvedValue(selectedEnvs);

      const result = await selector.selectGlobalSkillEnvironments();

      expect(result).toEqual(selectedEnvs);
    });
  });
});
