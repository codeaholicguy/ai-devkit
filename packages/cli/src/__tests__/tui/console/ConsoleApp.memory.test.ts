import { describe, expect, it } from 'vitest';
import { getNextRightPaneModeForMemoryShortcut } from '../../../tui/console/rightPaneMode.js';

describe('ConsoleApp memory shortcut helpers', () => {
    it('opens the memory pane from preview mode', () => {
        expect(getNextRightPaneModeForMemoryShortcut({ type: 'preview' })).toEqual({ type: 'memory-list' });
    });

    it('toggles back to preview from memory mode', () => {
        expect(getNextRightPaneModeForMemoryShortcut({ type: 'memory-list' })).toEqual({ type: 'preview' });
    });
});
