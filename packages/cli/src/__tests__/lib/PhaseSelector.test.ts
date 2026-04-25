import { PhaseSelector } from '../../lib/PhaseSelector';
import { AVAILABLE_PHASES } from '../../types';

jest.mock('inquirer');

jest.mock('../../util/terminal-ui', () => ({
  ui: { warning: jest.fn(), text: jest.fn(), breakline: jest.fn() },
}));
import { ui as mockUi } from '../../util/terminal-ui';

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
    it('should display nothing selected message for empty array', () => {
      selector.displaySelectionSummary([]);

      expect(mockUi.warning).toHaveBeenCalledWith('No phases selected.');
    });

    it('should display selected phases with checkmarks', () => {
      selector.displaySelectionSummary(['requirements', 'design']);

      expect(mockUi.text).toHaveBeenCalledWith('\nSelected phases:');
      expect(mockUi.text).toHaveBeenCalledWith('  Requirements & Problem Understanding');
      expect(mockUi.text).toHaveBeenCalledWith('  System Design & Architecture');
      expect(mockUi.breakline).toHaveBeenCalled();
    });

    it('should handle single phase selection', () => {
      selector.displaySelectionSummary(['requirements']);

      expect(mockUi.text).toHaveBeenCalledWith('\nSelected phases:');
      expect(mockUi.text).toHaveBeenCalledWith('  Requirements & Problem Understanding');
      expect(mockUi.breakline).toHaveBeenCalled();
    });
  });
});
