import { describe, expect, it } from 'vitest';
import { resolveConsoleKeyAction } from '../../../tui/console/consoleKeyRouting.js';
import type { ConsoleFocus } from '../../../tui/console/types.js';

interface ResolveOverrides {
    focus?: ConsoleFocus;
    input?: string;
    key?: {
        upArrow?: boolean;
        downArrow?: boolean;
        leftArrow?: boolean;
        escape?: boolean;
    };
    hasSelectedAgent?: boolean;
    previewVisible?: boolean;
}

function resolve(overrides: ResolveOverrides) {
    return resolveConsoleKeyAction({
        focus: 'list',
        input: '',
        key: {},
        hasSelectedAgent: true,
        previewVisible: true,
        ...overrides,
    });
}

describe('console focus routing', () => {
    it('enters detail focus from the list with v when preview is visible and an agent is selected', () => {
        expect(resolve({
            input: 'v',
        })).toEqual({ type: 'focus-detail' });
    });

    it('does not enter hidden detail focus in narrow mode', () => {
        expect(resolve({
            input: 'v',
            previewVisible: false,
        })).toEqual({ type: 'noop' });
    });

    it('does not enter detail focus when no agent is selected', () => {
        expect(resolve({
            input: 'v',
            hasSelectedAgent: false,
        })).toEqual({ type: 'noop' });
    });

    it('keeps list navigation routed to agent selection while the list is focused', () => {
        expect(resolve({
            input: 'j',
        })).toEqual({ type: 'select-agent', delta: 1 });
        expect(resolve({
            input: 'k',
        })).toEqual({ type: 'select-agent', delta: -1 });
    });

    it('keeps message input routing available from list and detail focus', () => {
        expect(resolve({
            input: 'i',
        })).toEqual({ type: 'focus-input' });
        expect(resolve({
            focus: 'detail',
            input: 'm',
        })).toEqual({ type: 'focus-input' });
    });

    it('routes arrows and j/k to preview scrolling while detail is focused', () => {
        expect(resolve({
            focus: 'detail',
            input: 'j',
        })).toEqual({ type: 'scroll-detail', delta: -1 });
        expect(resolve({
            focus: 'detail',
            input: 'k',
        })).toEqual({ type: 'scroll-detail', delta: 1 });
    });

    it('returns to list focus from detail with escape or left arrow', () => {
        expect(resolve({
            focus: 'detail',
            key: { escape: true },
        })).toEqual({ type: 'focus-list' });
        expect(resolve({
            focus: 'detail',
            key: { leftArrow: true },
        })).toEqual({ type: 'focus-list' });
    });
});
