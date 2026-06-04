import type { MockedFunction } from 'vitest';
import { checkbox } from '@inquirer/prompts';
import { PhaseSelector } from '../../lib/PhaseSelector.js';
import { AVAILABLE_PHASES } from '../../types.js';

vi.mock('@inquirer/prompts', () => ({
  checkbox: vi.fn(),
}));

vi.mock('../../util/terminal-ui.js', () => ({
  ui: { warning: vi.fn(), text: vi.fn(), breakline: vi.fn() },
}));
import { ui as mockUi } from '../../util/terminal-ui.js';

describe('PhaseSelector', () => {
  let selector: PhaseSelector;
  let mockCheckbox: MockedFunction<any>;

  beforeEach(() => {
    selector = new PhaseSelector();
    
    mockCheckbox = checkbox as MockedFunction<any>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('selectPhases', () => {
    it('should return all phases when all=true', async () => {
      const result = await selector.selectPhases(true);
      expect(result).toEqual(AVAILABLE_PHASES);
      expect(mockCheckbox).not.toHaveBeenCalled();
    });

    it('should parse phases string correctly', async () => {
      const result = await selector.selectPhases(false, 'requirements,design');
      expect(result).toEqual(['requirements', 'design']);
      expect(mockCheckbox).not.toHaveBeenCalled();
    });

    it('should trim whitespace from phase names', async () => {
      const result = await selector.selectPhases(false, ' requirements , design ');
      expect(result).toEqual(['requirements', 'design']);
    });

    it('should prompt user when no options provided', async () => {
      mockCheckbox.mockResolvedValue(['requirements', 'design']);

      const result = await selector.selectPhases();

      expect(mockCheckbox).toHaveBeenCalledTimes(1);
      expect(result).toEqual(['requirements', 'design']);
    });

    it('should return empty array when no phases selected', async () => {
      mockCheckbox.mockResolvedValue([]);

      const result = await selector.selectPhases();

      expect(result).toEqual([]);
    });

    it('should handle prompt rejection', async () => {
      mockCheckbox.mockRejectedValue(new Error('User cancelled'));

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
