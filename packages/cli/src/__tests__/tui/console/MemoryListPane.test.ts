import { describe, expect, it, vi } from 'vitest';
import {
    getHiddenMemoryCount,
    getMemoryListDisplayState,
    getMemoryListRows,
    getMemoryListStatusText,
    getVisibleMemoryItems,
} from '../../../tui/console/MemoryListPane.js';
import type { ConsoleMemoryItem } from '../../../tui/console/types.js';

vi.mock('@ai-devkit/memory', () => ({
    memoryListCommand: vi.fn(),
}), { virtual: true });

const items: ConsoleMemoryItem[] = [
    {
        id: 'mem-1',
        title: 'Use response DTOs for API handlers',
        scope: 'project:ai-devkit',
        tags: ['api', 'backend'],
        updatedAt: '2026-07-02T09:30:00.000Z',
    },
    {
        id: 'mem-2',
        title: 'Keep console panes height bounded',
        scope: 'repo:codeaholicguy/ai-devkit',
        tags: ['tui'],
        updatedAt: '2026-07-01T08:00:00.000Z',
    },
];

describe('MemoryListPane helpers', () => {
    it('formats memory items as terminal rows', () => {
        expect(getMemoryListRows(items, 80)).toEqual([
            {
                title: 'Use response DTOs for API handlers',
                meta: 'project:ai-devkit · api, backend · 2026-07-02',
            },
            {
                title: 'Keep console panes height bounded',
                meta: 'repo:codeaholicguy/ai-devkit · tui · 2026-07-01',
            },
        ]);
    });

    it('limits visible rows to the pane height budget', () => {
        expect(getVisibleMemoryItems(items, 5)).toEqual([items[0]]);
        expect(getVisibleMemoryItems(items, 8)).toEqual(items);
        expect(getVisibleMemoryItems(items, 1)).toEqual([]);
    });

    it('truncates long titles and metadata to fit the pane width', () => {
        const [row] = getMemoryListRows([
            {
                id: 'mem-3',
                title: 'x'.repeat(100),
                scope: 'project:' + 'y'.repeat(80),
                tags: ['frontend', 'console', 'memory'],
                updatedAt: '2026-07-03T10:00:00.000Z',
            },
        ], 30);

        expect(row.title).toHaveLength(30);
        expect(row.title.endsWith('...')).toBe(true);
        expect(row.meta.length).toBeLessThanOrEqual(30);
    });

    it('formats invalid dates and empty tags without crashing', () => {
        expect(getMemoryListRows([
            {
                id: 'mem-4',
                title: 'No tags',
                scope: 'global',
                tags: [],
                updatedAt: 'not-a-date',
            },
        ], 80)).toEqual([
            {
                title: 'No tags',
                meta: 'global · untagged · not-a-date',
            },
        ]);
    });

    it('classifies loading, error, empty, and item states', () => {
        expect(getMemoryListDisplayState({ isLoading: true, error: null, rowCount: 0 })).toBe('loading');
        expect(getMemoryListDisplayState({ isLoading: false, error: 'db failed', rowCount: 0 })).toBe('error');
        expect(getMemoryListDisplayState({ isLoading: false, error: null, rowCount: 0 })).toBe('empty');
        expect(getMemoryListDisplayState({ isLoading: false, error: null, rowCount: 1 })).toBe('items');
    });

    it('returns status text for non-item display states', () => {
        expect(getMemoryListStatusText({ displayState: 'loading', error: null, width: 80 })).toBe('loading...');
        expect(getMemoryListStatusText({ displayState: 'error', error: 'x'.repeat(20), width: 10 })).toBe('xxxxxxx...');
        expect(getMemoryListStatusText({ displayState: 'error', error: null, width: 80 })).toBe('Could not load memory.');
        expect(getMemoryListStatusText({ displayState: 'empty', error: null, width: 80 })).toBe('No memory items yet.');
        expect(getMemoryListStatusText({ displayState: 'items', error: null, width: 80 })).toBeNull();
    });

    it('computes hidden memory count without going below zero', () => {
        expect(getHiddenMemoryCount(10, 4)).toBe(6);
        expect(getHiddenMemoryCount(2, 4)).toBe(0);
    });
});
