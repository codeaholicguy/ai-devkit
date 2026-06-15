import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';
import {
    memoryListCommand,
    memoryStoreCommand,
    type ListKnowledgeResult,
} from '../../src/api';
import { closeDatabase } from '../../src/database';

describe('list knowledge command', () => {
    const testDbPath = join(tmpdir(), `test-list-${Date.now()}-${Math.random().toString(36)}.db`);

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

    function seedKnowledge(): void {
        memoryStoreCommand({
            dbPath: testDbPath,
            title: 'Always use Response DTOs for API endpoints',
            content: 'When building REST APIs, always use Response DTOs instead of returning domain entities directly for stable contracts.',
            tags: 'api,backend,dto',
            scope: 'global',
        });
        memoryStoreCommand({
            dbPath: testDbPath,
            title: 'Project memory dashboard graph strategy',
            content: 'The memory dashboard graph should connect memory items to tag and scope nodes for lightweight local inspection.',
            tags: 'dashboard,graph',
            scope: 'project:ai-devkit',
        });
        memoryStoreCommand({
            dbPath: testDbPath,
            title: 'Repository plugin command convention',
            content: 'Plugin command entrypoints should export register and use built JavaScript files for runtime loading.',
            tags: 'plugin,command',
            scope: 'repo:ai-devkit',
        });
    }

    it('returns bounded memory items with normalized fields', () => {
        seedKnowledge();

        const result: ListKnowledgeResult = memoryListCommand({
            dbPath: testDbPath,
            limit: 2,
        });

        expect(result.total).toBe(3);
        expect(result.items).toHaveLength(2);
        expect(result.items[0]).toEqual(expect.objectContaining({
            id: expect.any(String),
            title: expect.any(String),
            content: expect.any(String),
            tags: expect.any(Array),
            scope: expect.any(String),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
        }));
    });

    it('returns all matching memory items when no limit is provided', () => {
        seedKnowledge();

        const result = memoryListCommand({
            dbPath: testDbPath,
        });

        expect(result.total).toBe(3);
        expect(result.items).toHaveLength(3);
    });

    it('filters by query, scope, and tags', () => {
        seedKnowledge();

        const result = memoryListCommand({
            dbPath: testDbPath,
            query: 'dashboard graph',
            scope: 'project:ai-devkit',
            tags: 'dashboard',
        });

        expect(result.total).toBe(1);
        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.title).toBe('Project memory dashboard graph strategy');
    });
});
