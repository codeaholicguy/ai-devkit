import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';
import {
    memoryStoreCommand,
    memorySummaryCommand,
    type KnowledgeSummaryResult,
} from '../../src/api';
import { closeDatabase } from '../../src/database';

describe('knowledge summary command', () => {
    const testDbPath = join(tmpdir(), `test-summary-${Date.now()}-${Math.random().toString(36)}.db`);

    beforeEach(() => {
        closeDatabase();
        rmSync(testDbPath, { force: true });
        rmSync(`${testDbPath}-wal`, { force: true });
        rmSync(`${testDbPath}-shm`, { force: true });
    });

    afterAll(() => {
        closeDatabase();
        rmSync(testDbPath, { force: true });
        rmSync(`${testDbPath}-wal`, { force: true });
        rmSync(`${testDbPath}-shm`, { force: true });
    });

    it('returns empty counts for a new database', () => {
        const result: KnowledgeSummaryResult = memorySummaryCommand({ dbPath: testDbPath });

        expect(result).toEqual({
            totalItems: 0,
            scopes: [],
            tags: [],
            recency: [
                { bucket: 'today', count: 0 },
                { bucket: 'week', count: 0 },
                { bucket: 'month', count: 0 },
                { bucket: 'older', count: 0 },
            ],
        });
    });

    it('counts scopes, tags, and recency buckets', () => {
        memoryStoreCommand({
            dbPath: testDbPath,
            title: 'Global dashboard memory convention',
            content: 'The memory dashboard should expose a local read-only view for inspecting global memory records safely.',
            tags: 'dashboard,read',
            scope: 'global',
        });
        memoryStoreCommand({
            dbPath: testDbPath,
            title: 'Project plugin memory dashboard plan',
            content: 'The dashboard plugin should reuse the plugin runtime and configured memory database path.',
            tags: 'dashboard,plugin',
            scope: 'project:ai-devkit',
        });

        const result = memorySummaryCommand({ dbPath: testDbPath });

        expect(result.totalItems).toBe(2);
        expect(result.scopes).toEqual([
            { scope: 'global', count: 1 },
            { scope: 'project:ai-devkit', count: 1 },
        ]);
        expect(result.tags).toEqual([
            { tag: 'dashboard', count: 2 },
            { tag: 'plugin', count: 1 },
            { tag: 'read', count: 1 },
        ]);
        expect(result.recency.find(bucket => bucket.bucket === 'today')?.count).toBe(2);
    });
});
