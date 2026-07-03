import type { RightPaneMode } from './types.js';

export function getNextRightPaneModeForMemoryShortcut(current: RightPaneMode): RightPaneMode {
    return current.type === 'memory-list' ? { type: 'preview' } : { type: 'memory-list' };
}
