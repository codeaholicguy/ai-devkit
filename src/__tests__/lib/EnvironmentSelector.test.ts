import { EnvironmentSelector } from '../../lib/EnvironmentSelector';
import { getAllEnvironments } from '../../util/env';

jest.mock('inquirer');

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
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should display nothing selected message for empty array', () => {
      selector.displaySelectionSummary([]);

      expect(consoleSpy).toHaveBeenCalledWith('No environments selected.');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('should display selected environments with checkmarks', () => {
      selector.displaySelectionSummary(['cursor', 'claude']);

      expect(consoleSpy).toHaveBeenCalledWith('\nSelected environments:');
      expect(consoleSpy).toHaveBeenCalledWith('  Cursor');
      expect(consoleSpy).toHaveBeenCalledWith('  Claude Code');
      expect(consoleSpy).toHaveBeenCalledWith('');
    });

    it('should handle single environment selection', () => {
      selector.displaySelectionSummary(['cursor']);

      expect(consoleSpy).toHaveBeenCalledWith('\nSelected environments:');
      expect(consoleSpy).toHaveBeenCalledWith('  Cursor');
      expect(consoleSpy).toHaveBeenCalledWith('');
    });
  });
});
