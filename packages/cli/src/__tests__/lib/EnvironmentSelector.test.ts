import { EnvironmentSelector } from '../../lib/EnvironmentSelector';
import { getAllEnvironments } from '../../util/env';

jest.mock('inquirer');

jest.mock('../../util/terminal-ui', () => ({
  ui: { warning: jest.fn(), info: jest.fn(), text: jest.fn(), breakline: jest.fn() },
}));
import { ui as mockUi } from '../../util/terminal-ui';

describe('EnvironmentSelector', () => {
  let selector: EnvironmentSelector;
  let mockPrompt: jest.MockedFunction<any>;

  beforeEach(() => {
    selector = new EnvironmentSelector();
    const inquirer = require('inquirer');
    mockPrompt = jest.fn();
    inquirer.prompt = mockPrompt;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('selectEnvironments', () => {
    it('should create choices from all environments', async () => {
      const environments = getAllEnvironments();
      mockPrompt.mockResolvedValue({ environments: ['cursor', 'claude'] });

      await selector.selectEnvironments();

      expect(mockPrompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'checkbox',
          name: 'environments',
          message: 'Select AI environments to set up (use space to select, enter to confirm):',
          choices: environments.map(env => ({
            name: env.name,
            value: env.code,
            short: env.name
          })),
          validate: expect.any(Function)
        })
      ]);
    });

    it('should return selected environments', async () => {
      const selectedEnvs = ['cursor', 'claude'];
      mockPrompt.mockResolvedValue({ environments: selectedEnvs });

      const result = await selector.selectEnvironments();

      expect(result).toEqual(selectedEnvs);
    });

    it('should validate that at least one environment is selected', async () => {
      mockPrompt.mockResolvedValue({ environments: [] });

      const result = await selector.selectEnvironments();

      expect(result).toEqual([]);

      const callArgs = mockPrompt.mock.calls[0][0];
      const validateFn = callArgs[0].validate;

      expect(validateFn([])).toBe('Please select at least one environment.');
      expect(validateFn(['cursor'])).toBe(true);
    });

    it('should handle prompt rejection', async () => {
      mockPrompt.mockRejectedValue(new Error('User cancelled'));

      await expect(selector.selectEnvironments()).rejects.toThrow('User cancelled');
    });
  });

  describe('confirmOverride', () => {
    it('should return true immediately for empty conflicts', async () => {
      const result = await selector.confirmOverride([]);
      expect(result).toBe(true);
      expect(mockPrompt).not.toHaveBeenCalled();
    });

    it('should prompt user for confirmation with conflict details', async () => {
      mockPrompt.mockResolvedValue({ proceed: true });

      const result = await selector.confirmOverride(['cursor', 'claude']);

      expect(result).toBe(true);
      expect(mockPrompt).toHaveBeenCalledWith([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'The following environments are already set up and will be overwritten:\n  Cursor, Claude Code\n\nDo you want to continue?',
          default: false
        }
      ]);
    });

    it('should return false when user declines', async () => {
      mockPrompt.mockResolvedValue({ proceed: false });

      const result = await selector.confirmOverride(['cursor']);

      expect(result).toBe(false);
    });

    it('should handle single environment conflict', async () => {
      mockPrompt.mockResolvedValue({ proceed: true });

      const result = await selector.confirmOverride(['cursor']);

      expect(result).toBe(true);
      const message = mockPrompt.mock.calls[0][0][0].message;
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

  describe('selectGlobalEnvironments', () => {
    it('should create choices only from global-capable environments', async () => {
      mockPrompt.mockResolvedValue({ environments: ['antigravity'] });

      await selector.selectGlobalEnvironments();

      expect(mockPrompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'checkbox',
          name: 'environments',
          message: 'Select AI environments for global setup (use space to select, enter to confirm):',
          choices: expect.arrayContaining([
            expect.objectContaining({ value: 'antigravity' }),
            expect.objectContaining({ value: 'codex' })
          ]),
          validate: expect.any(Function)
        })
      ]);
    });

    it('should return selected global environments', async () => {
      const selectedEnvs = ['antigravity', 'codex'];
      mockPrompt.mockResolvedValue({ environments: selectedEnvs });

      const result = await selector.selectGlobalEnvironments();

      expect(result).toEqual(selectedEnvs);
    });

    it('should validate that at least one environment is selected', async () => {
      mockPrompt.mockResolvedValue({ environments: [] });

      const result = await selector.selectGlobalEnvironments();

      expect(result).toEqual([]);

      const callArgs = mockPrompt.mock.calls[0][0];
      const validateFn = callArgs[0].validate;

      expect(validateFn([])).toBe('Please select at least one environment.');
      expect(validateFn(['antigravity'])).toBe(true);
    });

    it('should not include non-global environments in choices', async () => {
      mockPrompt.mockResolvedValue({ environments: ['antigravity'] });

      await selector.selectGlobalEnvironments();

      const callArgs = mockPrompt.mock.calls[0][0];
      const choices = callArgs[0].choices;
      const choiceValues = choices.map((c: any) => c.value);

      // Should only have Antigravity and Codex
      expect(choiceValues).toContain('antigravity');
      expect(choiceValues).toContain('codex');
      expect(choiceValues).not.toContain('cursor');
      expect(choiceValues).not.toContain('claude');
      expect(choiceValues).not.toContain('github');
    });

    it('should show exactly 2 choices (Antigravity and Codex)', async () => {
      mockPrompt.mockResolvedValue({ environments: [] });

      await selector.selectGlobalEnvironments();

      const callArgs = mockPrompt.mock.calls[0][0];
      const choices = callArgs[0].choices;

      expect(choices).toHaveLength(2);
    });
  });

  describe('selectGlobalSkillEnvironments', () => {
    it('should create choices from global-skill-capable environments', async () => {
      mockPrompt.mockResolvedValue({ environments: ['claude'] });

      await selector.selectGlobalSkillEnvironments();

      expect(mockPrompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'checkbox',
          name: 'environments',
          message: 'Select AI environments for global skill installation (use space to select, enter to confirm):',
          choices: expect.arrayContaining([
            expect.objectContaining({ value: 'cursor' }),
            expect.objectContaining({ value: 'claude' }),
            expect.objectContaining({ value: 'codex' }),
            expect.objectContaining({ value: 'gemini' }),
            expect.objectContaining({ value: 'opencode' }),
            expect.objectContaining({ value: 'antigravity' })
          ]),
          validate: expect.any(Function)
        })
      ]);
    });

    it('should return selected global-skill environments', async () => {
      const selectedEnvs = ['claude', 'codex'];
      mockPrompt.mockResolvedValue({ environments: selectedEnvs });

      const result = await selector.selectGlobalSkillEnvironments();

      expect(result).toEqual(selectedEnvs);
    });
  });
});
