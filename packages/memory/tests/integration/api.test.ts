import { existsSync, unlinkSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { memorySearchCommand, memoryStoreCommand, memoryUpdateCommand } from '../../src/api';

describe('memory api command helpers', () => {
    const testDbPath = join(tmpdir(), `test-api-${Date.now()}-${Math.random().toString(36)}.db`);
    const defaultDbPath = join(homedir(), '.ai-devkit', 'memory.db');

    afterEach(() => {
        for (const suffix of ['', '-wal', '-shm']) {
            const currentTestPath = `${testDbPath}${suffix}`;
            if (existsSync(currentTestPath)) {
                unlinkSync(currentTestPath);
            }
        }
    });

    it('uses explicit dbPath for store, search, and update', () => {
        const storeResult = memoryStoreCommand({
            title: 'A valid title 123',
            content: 'This is a valid content body long enough to satisfy constraints for the integration test.',
            dbPath: testDbPath
        });

        expect(storeResult.success).toBe(true);
        expect(existsSync(testDbPath)).toBe(true);

        const searchResult = memorySearchCommand({
            query: 'valid title',
            dbPath: testDbPath
        });

        expect(searchResult.results.some(result => result.id === storeResult.id)).toBe(true);

        const updateResult = memoryUpdateCommand({
            id: storeResult.id!,
            title: 'A valid updated title 123',
            dbPath: testDbPath
        });

        expect(updateResult.success).toBe(true);

        const updatedSearch = memorySearchCommand({
            query: 'updated title',
            dbPath: testDbPath
        });

        expect(updatedSearch.results.some(result => result.id === storeResult.id)).toBe(true);
        expect(defaultDbPath).not.toBe(testDbPath);
    });
});
