import { describe, expect, it } from 'vitest';
import { getNextRightPaneModeForMemoryShortcut } from '../../../tui/console/rightPaneMode.js';
import type { AgentInfo } from '@ai-devkit/agent-manager';
import { getVisibleSelection, isAgentFilterInPlay } from '../../../tui/console/ConsoleApp.js';

describe('ConsoleApp memory shortcut helpers', () => {
    it('opens the memory pane from preview mode', () => {
        expect(getNextRightPaneModeForMemoryShortcut({ type: 'preview' })).toEqual({ type: 'memory-list' });
    });

    it('toggles back to preview from memory mode', () => {
        expect(getNextRightPaneModeForMemoryShortcut({ type: 'memory-list' })).toEqual({ type: 'preview' });
    });
});

describe('ConsoleApp agent filter helpers', () => {
    const agents = [{ name: 'second' }, { name: 'first' }] as AgentInfo[];

    it('keeps a visible selection and otherwise chooses the first received match', () => {
        expect(getVisibleSelection(agents, 'first')).toBe('first');
        expect(getVisibleSelection(agents, 'hidden')).toBe('second');
        expect(getVisibleSelection([], 'first')).toBeNull();
    });

    it('pauses polling while editing or while query text is applied', () => {
        expect(isAgentFilterInPlay('', false)).toBe(false);
        expect(isAgentFilterInPlay('', true)).toBe(true);
        expect(isAgentFilterInPlay('agent', false)).toBe(true);
    });
});
