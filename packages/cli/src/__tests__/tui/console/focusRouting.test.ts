import { describe, expect, it } from 'vitest';
import { resolveConsoleKeyAction } from '../../../tui/console/consoleKeyRouting.js';

describe('console focus routing', () => {
    it('enters detail focus from the list with v when preview is visible and an agent is selected', () => {
        expect(resolveConsoleKeyAction({
            focus: 'list',
            input: 'v',
            key: {},
            hasSelectedAgent: true,
            previewVisible: true,
        })).toEqual({ type: 'focus-detail' });
    });

    it('does not enter hidden detail focus in narrow mode', () => {
        expect(resolveConsoleKeyAction({
            focus: 'list',
            input: 'v',
            key: {},
            hasSelectedAgent: true,
            previewVisible: false,
        })).toEqual({ type: 'noop' });
    });

    it('does not enter detail focus when no agent is selected', () => {
        expect(resolveConsoleKeyAction({
            focus: 'list',
            input: 'v',
            key: {},
            hasSelectedAgent: false,
            previewVisible: true,
        })).toEqual({ type: 'noop' });
    });

    it('keeps list navigation routed to agent selection while the list is focused', () => {
        expect(resolveConsoleKeyAction({
            focus: 'list',
            input: 'j',
            key: {},
            hasSelectedAgent: true,
            previewVisible: true,
        })).toEqual({ type: 'select-agent', delta: 1 });
        expect(resolveConsoleKeyAction({
            focus: 'list',
            input: 'k',
            key: {},
            hasSelectedAgent: true,
            previewVisible: true,
        })).toEqual({ type: 'select-agent', delta: -1 });
    });

    it('keeps message input routing available from list and detail focus', () => {
        expect(resolveConsoleKeyAction({
            focus: 'list',
            input: 'i',
            key: {},
            hasSelectedAgent: true,
            previewVisible: true,
        })).toEqual({ type: 'focus-input' });
        expect(resolveConsoleKeyAction({
            focus: 'detail',
            input: 'm',
            key: {},
            hasSelectedAgent: true,
            previewVisible: true,
        })).toEqual({ type: 'focus-input' });
    });

    it('routes arrows and j/k to preview scrolling while detail is focused', () => {
        expect(resolveConsoleKeyAction({
            focus: 'detail',
            input: 'j',
            key: {},
            hasSelectedAgent: true,
            previewVisible: true,
        })).toEqual({ type: 'scroll-detail', delta: -1 });
        expect(resolveConsoleKeyAction({
            focus: 'detail',
            input: 'k',
            key: {},
            hasSelectedAgent: true,
            previewVisible: true,
        })).toEqual({ type: 'scroll-detail', delta: 1 });
    });

    it('returns to list focus from detail with escape or left arrow', () => {
        expect(resolveConsoleKeyAction({
            focus: 'detail',
            input: '',
            key: { escape: true },
            hasSelectedAgent: true,
            previewVisible: true,
        })).toEqual({ type: 'focus-list' });
        expect(resolveConsoleKeyAction({
            focus: 'detail',
            input: '',
            key: { leftArrow: true },
            hasSelectedAgent: true,
            previewVisible: true,
        })).toEqual({ type: 'focus-list' });
    });
});
