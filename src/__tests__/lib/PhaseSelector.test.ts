import { PhaseSelector } from '../../lib/PhaseSelector';
import { AVAILABLE_PHASES, PHASE_DISPLAY_NAMES } from '../../types';

jest.mock('inquirer');

describe('PhaseSelector', () => {
  let selector: PhaseSelector;
  let mockPrompt: jest.MockedFunction<any>;

  beforeEach(() => {
    selector = new PhaseSelector();
    const inquirer = require('inquirer');
    mockPrompt = jest.fn();
    inquirer.prompt = mockPrompt;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('selectPhases', () => {
    it('should return all phases when all=true', async () => {
      const result = await selector.selectPhases(true);
      expect(result).toEqual(AVAILABLE_PHASES);
      expect(mockPrompt).not.toHaveBeenCalled();
    });

    it('should parse phases string correctly', async () => {
      const result = await selector.selectPhases(false, 'requirements,design');
      expect(result).toEqual(['requirements', 'design']);
      expect(mockPrompt).not.toHaveBeenCalled();
    });

    it('should trim whitespace from phase names', async () => {
      const result = await selector.selectPhases(false, ' requirements , design ');
      expect(result).toEqual(['requirements', 'design']);
    });

    it('should prompt user when no options provided', async () => {
      mockPrompt.mockResolvedValue({ phases: ['requirements', 'design'] });

      const result = await selector.selectPhases();

      expect(mockPrompt).toHaveBeenCalledTimes(1);
      expect(result).toEqual(['requirements', 'design']);
    });

    it('should return empty array when no phases selected', async () => {
      mockPrompt.mockResolvedValue({ phases: [] });

      const result = await selector.selectPhases();

      expect(result).toEqual([]);
    });

    it('should handle prompt rejection', async () => {
      mockPrompt.mockRejectedValue(new Error('User cancelled'));

      await expect(selector.selectPhases()).rejects.toThrow('User cancelled');
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

      expect(consoleSpy).toHaveBeenCalledWith('No phases selected.');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('should display selected phases with checkmarks', () => {
      selector.displaySelectionSummary(['requirements', 'design']);

      expect(consoleSpy).toHaveBeenCalledWith('\nSelected phases:');
      expect(consoleSpy).toHaveBeenCalledWith('  Requirements & Problem Understanding');
      expect(consoleSpy).toHaveBeenCalledWith('  System Design & Architecture');
      expect(consoleSpy).toHaveBeenCalledWith('');
    });

    it('should handle single phase selection', () => {
      selector.displaySelectionSummary(['requirements']);

      expect(consoleSpy).toHaveBeenCalledWith('\nSelected phases:');
      expect(consoleSpy).toHaveBeenCalledWith('  Requirements & Problem Understanding');
      expect(consoleSpy).toHaveBeenCalledWith('');
    });
  });
});
