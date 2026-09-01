import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';
import { DatabaseConnection } from '../../src/database/connection';
import { initializeSchema, getSchemaVersion } from '../../src/database/schema';

describe('semantic embedding migration', () => {
    const dbPath = join(tmpdir(), `semantic-storage-${Date.now()}-${Math.random().toString(36)}.db`);
    let db: DatabaseConnection;

    beforeAll(() => {
        db = new DatabaseConnection({ dbPath });
        initializeSchema(db);
    });

    afterAll(() => {
        db.close();
        rmSync(dbPath, { force: true });
        rmSync(`${dbPath}-wal`, { force: true });
        rmSync(`${dbPath}-shm`, { force: true });
    });

    it('adds nullable embedding and version columns in migration 002', () => {
        const columns = db.query<{ name: string }>('PRAGMA table_info(knowledge)').map(row => row.name);
        expect(getSchemaVersion(db)).toBe(2);
        expect(columns).toContain('embedding');
        expect(columns).toContain('embedding_version');
    });
});
