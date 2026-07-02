import type { ConsoleFocus } from './types.js';

interface ConsoleKeyLike {
    upArrow?: boolean;
    downArrow?: boolean;
    leftArrow?: boolean;
    escape?: boolean;
}

interface ResolveConsoleKeyActionParams {
    focus: ConsoleFocus;
    input: string;
    key: ConsoleKeyLike;
    hasSelectedAgent: boolean;
    previewVisible: boolean;
}

export type ConsoleKeyAction =
    | { type: 'noop' }
    | { type: 'focus-list' }
    | { type: 'focus-detail' }
    | { type: 'focus-input' }
    | { type: 'scroll-detail'; delta: number }
    | { type: 'select-agent'; delta: number };

export function resolveConsoleKeyAction({
    focus,
    input,
    key,
    hasSelectedAgent,
    previewVisible,
}: ResolveConsoleKeyActionParams): ConsoleKeyAction {
    if (focus === 'detail') {
        if (key.escape || key.leftArrow) return { type: 'focus-list' };
        if (input === 'i' || input === 'm') return hasSelectedAgent ? { type: 'focus-input' } : { type: 'noop' };
        if (key.downArrow || input === 'j') return { type: 'scroll-detail', delta: -1 };
        if (key.upArrow || input === 'k') return { type: 'scroll-detail', delta: 1 };
        return { type: 'noop' };
    }

    if (focus === 'list') {
        if (input === 'v') {
            return hasSelectedAgent && previewVisible ? { type: 'focus-detail' } : { type: 'noop' };
        }
        if (input === 'i' || input === 'm') return hasSelectedAgent ? { type: 'focus-input' } : { type: 'noop' };
        if (key.downArrow || input === 'j') return { type: 'select-agent', delta: 1 };
        if (key.upArrow || input === 'k') return { type: 'select-agent', delta: -1 };
    }

    return { type: 'noop' };
}
