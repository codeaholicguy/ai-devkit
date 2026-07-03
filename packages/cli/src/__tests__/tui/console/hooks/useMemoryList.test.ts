import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeItem } from '@ai-devkit/memory';
import { loadMemoryList } from '../../../../tui/console/hooks/useMemoryList.js';

vi.mock('@ai-devkit/memory', () => ({
    memoryListCommand: vi.fn(),
}), { virtual: true });

const makeItem = (overrides: Partial<KnowledgeItem> = {}): KnowledgeItem => ({
    id: 'mem-1',
    title: 'Use response DTOs',
    content: 'Return response DTOs instead of domain entities.',
    tags: ['api', 'backend'],
    scope: 'project:ai-devkit',
    normalizedTitle: 'use response dtos',
    contentHash: 'hash',
    createdAt: '2026-07-01T08:00:00.000Z',
    updatedAt: '2026-07-02T09:30:00.000Z',
    ...overrides,
});

describe('loadMemoryList', () => {
    it('resolves the configured database path and loads recent memory items', async () => {
        const getMemoryDbPath = vi.fn().mockResolvedValue('/tmp/memory.db');
        const memoryListCommand = vi.fn().mockReturnValue({
            items: [makeItem()],
            total: 1,
        });

        const result = await loadMemoryList({ getMemoryDbPath, memoryListCommand });

        expect(getMemoryDbPath).toHaveBeenCalledOnce();
        expect(memoryListCommand).toHaveBeenCalledWith({
            dbPath: '/tmp/memory.db',
            limit: 20,
            sort: 'updated-desc',
        });
        expect(result.items).toEqual([
            {
                id: 'mem-1',
                title: 'Use response DTOs',
                scope: 'project:ai-devkit',
                tags: ['api', 'backend'],
                updatedAt: '2026-07-02T09:30:00.000Z',
            },
        ]);
        expect(result.total).toBe(1);
    });

    it('passes undefined dbPath when no project memory path is configured', async () => {
        const getMemoryDbPath = vi.fn().mockResolvedValue(undefined);
        const memoryListCommand = vi.fn().mockReturnValue({ items: [], total: 0 });

        await loadMemoryList({ getMemoryDbPath, memoryListCommand });

        expect(memoryListCommand).toHaveBeenCalledWith({
            dbPath: undefined,
            limit: 20,
            sort: 'updated-desc',
        });
    });
});
