import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';
import { closeDatabase, getDatabase, type DatabaseConnection } from '../../../src/database';
import { ValidationError, DuplicateError } from '../../../src/domain/knowledge/errors';
import { storeKnowledge } from '../../../src/services/knowledge.service';

describe('store handler', () => {
    const testDbPath = join(tmpdir(), `test-store-${Date.now()}-${Math.random().toString(36)}.db`);
    let db: DatabaseConnection;

    beforeAll(() => {
        db = getDatabase({ dbPath: testDbPath });
    });

    afterAll(() => {
        closeDatabase();
        rmSync(testDbPath, { force: true });
        rmSync(testDbPath + '-wal', { force: true });
        rmSync(testDbPath + '-shm', { force: true });
    });

    beforeEach(() => {
        db.execute('DELETE FROM knowledge');
    });

    const validInput = {
        title: 'Always use Response DTOs for API endpoints',
        content: 'When building REST APIs, always use Response DTOs instead of returning domain entities directly. This provides better API versioning.',
        tags: ['api', 'backend'],
        scope: 'global',
    };

    describe('successful storage', () => {
        it('should store valid knowledge and return id', () => {
            const result = storeKnowledge(validInput);
            expect(result.success).toBe(true);
            expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
        });

        it('should persist knowledge in database', () => {
            const result = storeKnowledge(validInput);
            const stored = db.queryOne<{ title: string }>('SELECT title FROM knowledge WHERE id = ?', [result.id]);
            expect(stored?.title).toBe(validInput.title);
        });

        it('should normalize and store tags as JSON', () => {
            const result = storeKnowledge({ ...validInput, tags: ['API', 'Backend', 'API'] });
            const stored = db.queryOne<{ tags: string }>('SELECT tags FROM knowledge WHERE id = ?', [result.id]);
            expect(JSON.parse(stored?.tags || '[]')).toEqual(['api', 'backend']);
        });

        it('should use global scope by default', () => {
            const result = storeKnowledge({ title: validInput.title, content: validInput.content });
            const stored = db.queryOne<{ scope: string }>('SELECT scope FROM knowledge WHERE id = ?', [result.id]);
            expect(stored?.scope).toBe('global');
        });
    });

    describe('validation errors', () => {
        it('should reject short title', () => {
            expect(() => storeKnowledge({ ...validInput, title: 'Short' })).toThrow(ValidationError);
        });

        it('should reject short content', () => {
            expect(() => storeKnowledge({ ...validInput, content: 'Too short' })).toThrow(ValidationError);
        });
    });

    describe('duplicate detection', () => {
        it('should reject duplicate title in same scope', () => {
            storeKnowledge(validInput);
            expect(() => storeKnowledge({ ...validInput, content: 'This is completely different content that should still trigger a duplicate title error in the same scope.' })).toThrow(DuplicateError);
        });

        it('should reject duplicate content in same scope', () => {
            storeKnowledge(validInput);
            expect(() => storeKnowledge({ ...validInput, title: 'Different title that is long enough' })).toThrow(DuplicateError);
        });

        it('should allow same title in different scope', () => {
            storeKnowledge(validInput);
            const result = storeKnowledge({ ...validInput, scope: 'project:other' });
            expect(result.success).toBe(true);
        });
    });
});
