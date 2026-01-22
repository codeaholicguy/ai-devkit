import { join } from 'path';
import { tmpdir } from 'os';
import { unlinkSync, existsSync } from 'fs';
import { DatabaseConnection } from '../../src/database/connection';
import { initializeSchema } from '../../src/database/schema';
import { ValidationError, DuplicateError } from '../../src/utils/errors';
import { validateStoreInput } from '../../src/services/validator';
import { normalizeTitle, normalizeScope, normalizeTags, hashContent } from '../../src/services/normalizer';
import { v4 as uuidv4 } from 'uuid';

function storeKnowledgeDirect(db: DatabaseConnection, input: {
    title: string;
    content: string;
    tags?: string[];
    scope?: string;
}) {
    validateStoreInput(input);

    const now = new Date().toISOString();
    const normalizedTitle = normalizeTitle(input.title);
    const scope = normalizeScope(input.scope);
    const tags = normalizeTags(input.tags ?? []);
    const contentHash = hashContent(input.content);
    const id = uuidv4();

    return db.transaction(() => {
        const existingByTitle = db.queryOne<{ id: string }>(
            'SELECT id FROM knowledge WHERE normalized_title = ? AND scope = ?',
            [normalizedTitle, scope]
        );

        if (existingByTitle) {
            throw new DuplicateError('Duplicate title', existingByTitle.id, 'title');
        }

        const existingByHash = db.queryOne<{ id: string }>(
            'SELECT id FROM knowledge WHERE content_hash = ? AND scope = ?',
            [contentHash, scope]
        );

        if (existingByHash) {
            throw new DuplicateError('Duplicate content', existingByHash.id, 'content');
        }

        db.execute(
            `INSERT INTO knowledge (id, title, content, tags, scope, normalized_title, content_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, input.title.trim(), input.content.trim(), JSON.stringify(tags), scope, normalizedTitle, contentHash, now, now]
        );

        return { success: true, id, message: 'Stored' };
    });
}

describe('store handler', () => {
    const testDbPath = join(tmpdir(), `test-store-${Date.now()}-${Math.random().toString(36)}.db`);
    let db: DatabaseConnection;

    beforeAll(() => {
        db = new DatabaseConnection({ dbPath: testDbPath });
        initializeSchema(db);
    });

    afterAll(() => {
        db.close();
        try {
            if (existsSync(testDbPath)) unlinkSync(testDbPath);
            if (existsSync(testDbPath + '-wal')) unlinkSync(testDbPath + '-wal');
            if (existsSync(testDbPath + '-shm')) unlinkSync(testDbPath + '-shm');
        } catch { }
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
            const result = storeKnowledgeDirect(db, validInput);
            expect(result.success).toBe(true);
            expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
        });

        it('should persist knowledge in database', () => {
            const result = storeKnowledgeDirect(db, validInput);
            const stored = db.queryOne<{ title: string }>('SELECT title FROM knowledge WHERE id = ?', [result.id]);
            expect(stored?.title).toBe(validInput.title);
        });

        it('should normalize and store tags as JSON', () => {
            const result = storeKnowledgeDirect(db, { ...validInput, tags: ['API', 'Backend', 'API'] });
            const stored = db.queryOne<{ tags: string }>('SELECT tags FROM knowledge WHERE id = ?', [result.id]);
            expect(JSON.parse(stored?.tags || '[]')).toEqual(['api', 'backend']);
        });

        it('should use global scope by default', () => {
            const result = storeKnowledgeDirect(db, { title: validInput.title, content: validInput.content });
            const stored = db.queryOne<{ scope: string }>('SELECT scope FROM knowledge WHERE id = ?', [result.id]);
            expect(stored?.scope).toBe('global');
        });
    });

    describe('validation errors', () => {
        it('should reject short title', () => {
            expect(() => storeKnowledgeDirect(db, { ...validInput, title: 'Short' })).toThrow(ValidationError);
        });

        it('should reject short content', () => {
            expect(() => storeKnowledgeDirect(db, { ...validInput, content: 'Too short' })).toThrow(ValidationError);
        });
    });

    describe('duplicate detection', () => {
        it('should reject duplicate title in same scope', () => {
            storeKnowledgeDirect(db, validInput);
            expect(() => storeKnowledgeDirect(db, { ...validInput, content: 'This is completely different content that should still trigger a duplicate title error in the same scope.' })).toThrow(DuplicateError);
        });

        it('should reject duplicate content in same scope', () => {
            storeKnowledgeDirect(db, validInput);
            expect(() => storeKnowledgeDirect(db, { ...validInput, title: 'Different title that is long enough' })).toThrow(DuplicateError);
        });

        it('should allow same title in different scope', () => {
            storeKnowledgeDirect(db, validInput);
            const result = storeKnowledgeDirect(db, { ...validInput, scope: 'project:other' });
            expect(result.success).toBe(true);
        });
    });
});
