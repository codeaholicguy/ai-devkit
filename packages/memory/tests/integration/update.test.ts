import { join } from 'path';
import { tmpdir } from 'os';
import { unlinkSync, existsSync } from 'fs';
import { DatabaseConnection } from '../../src/database/connection';
import { initializeSchema } from '../../src/database/schema';
import { ValidationError, DuplicateError, NotFoundError } from '../../src/utils/errors';
import { validateStoreInput, validateUpdateInput } from '../../src/services/validator';
import { normalizeTitle, normalizeScope, normalizeTags, hashContent } from '../../src/services/normalizer';
import { v4 as uuidv4 } from 'uuid';
import type { KnowledgeRow } from '../../src/types';

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

function updateKnowledgeDirect(db: DatabaseConnection, input: {
    id: string;
    title?: string;
    content?: string;
    tags?: string[];
    scope?: string;
}) {
    validateUpdateInput(input);

    const now = new Date().toISOString();

    return db.transaction(() => {
        const existing = db.queryOne<KnowledgeRow>(
            'SELECT * FROM knowledge WHERE id = ?',
            [input.id]
        );

        if (!existing) {
            throw new NotFoundError(`Knowledge item not found: ${input.id}`, input.id);
        }

        const title = input.title !== undefined ? input.title.trim() : existing.title;
        const content = input.content !== undefined ? input.content.trim() : existing.content;
        const tags = input.tags !== undefined ? normalizeTags(input.tags) : JSON.parse(existing.tags);
        const scope = input.scope !== undefined ? normalizeScope(input.scope) : existing.scope;
        const normalizedTitle = normalizeTitle(title);
        const contentHash = hashContent(content);

        const existingByTitle = db.queryOne<KnowledgeRow>(
            'SELECT id FROM knowledge WHERE normalized_title = ? AND scope = ? AND id != ?',
            [normalizedTitle, scope, input.id]
        );

        if (existingByTitle) {
            throw new DuplicateError(
                'Knowledge with similar title already exists in this scope',
                existingByTitle.id,
                'title'
            );
        }

        const existingByHash = db.queryOne<KnowledgeRow>(
            'SELECT id FROM knowledge WHERE content_hash = ? AND scope = ? AND id != ?',
            [contentHash, scope, input.id]
        );

        if (existingByHash) {
            throw new DuplicateError(
                'Knowledge with identical content already exists in this scope',
                existingByHash.id,
                'content'
            );
        }

        db.execute(
            `UPDATE knowledge SET
                title = ?, content = ?, tags = ?, scope = ?,
                normalized_title = ?, content_hash = ?, updated_at = ?
            WHERE id = ?`,
            [title, content, JSON.stringify(tags), scope, normalizedTitle, contentHash, now, input.id]
        );

        return { success: true, id: input.id, message: 'Knowledge updated successfully' };
    });
}

describe('update handler', () => {
    const testDbPath = join(tmpdir(), `test-update-${Date.now()}-${Math.random().toString(36)}.db`);
    let db: DatabaseConnection;

    const validInput = {
        title: 'Always use Response DTOs for API endpoints',
        content: 'When building REST APIs, always use Response DTOs instead of returning domain entities directly. This provides better API versioning.',
        tags: ['api', 'backend'],
        scope: 'global',
    };

    const validInput2 = {
        title: 'Use dependency injection for service layers',
        content: 'Always inject dependencies via constructor to enable easier testing and loose coupling between components in the system.',
        tags: ['architecture', 'testing'],
        scope: 'global',
    };

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

    describe('successful updates', () => {
        it('should update title only', () => {
            const stored = storeKnowledgeDirect(db, validInput);
            const result = updateKnowledgeDirect(db, {
                id: stored.id,
                title: 'Updated title for API endpoints usage',
            });

            expect(result.success).toBe(true);
            expect(result.id).toBe(stored.id);

            const row = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(row?.title).toBe('Updated title for API endpoints usage');
            expect(row?.content).toBe(validInput.content);
        });

        it('should update content only', () => {
            const stored = storeKnowledgeDirect(db, validInput);
            const newContent = 'Updated content that is long enough to pass validation rules. This replaces the old content entirely with new information.';
            const result = updateKnowledgeDirect(db, {
                id: stored.id,
                content: newContent,
            });

            expect(result.success).toBe(true);

            const row = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(row?.content).toBe(newContent);
            expect(row?.title).toBe(validInput.title);
        });

        it('should update tags only', () => {
            const stored = storeKnowledgeDirect(db, validInput);
            const result = updateKnowledgeDirect(db, {
                id: stored.id,
                tags: ['new-tag', 'updated'],
            });

            expect(result.success).toBe(true);

            const row = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(JSON.parse(row?.tags || '[]')).toEqual(['new-tag', 'updated']);
        });

        it('should update scope only', () => {
            const stored = storeKnowledgeDirect(db, validInput);
            const result = updateKnowledgeDirect(db, {
                id: stored.id,
                scope: 'project:my-app',
            });

            expect(result.success).toBe(true);

            const row = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(row?.scope).toBe('project:my-app');
        });

        it('should update multiple fields at once', () => {
            const stored = storeKnowledgeDirect(db, validInput);
            const newTitle = 'Completely new title for this item';
            const newContent = 'Completely new content for this knowledge item that is long enough to pass the validation rules set in the validator.';
            const result = updateKnowledgeDirect(db, {
                id: stored.id,
                title: newTitle,
                content: newContent,
                tags: ['updated'],
                scope: 'project:new-project',
            });

            expect(result.success).toBe(true);

            const row = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(row?.title).toBe(newTitle);
            expect(row?.content).toBe(newContent);
            expect(JSON.parse(row?.tags || '[]')).toEqual(['updated']);
            expect(row?.scope).toBe('project:new-project');
        });

        it('should refresh updated_at timestamp', () => {
            const stored = storeKnowledgeDirect(db, validInput);
            const rowBefore = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);

            // Mock Date to return a future timestamp to avoid same-millisecond flakiness
            const futureDate = new Date(Date.now() + 1000);
            jest.spyOn(global, 'Date').mockImplementation(() => futureDate as unknown as Date);

            updateKnowledgeDirect(db, {
                id: stored.id,
                tags: ['refreshed'],
            });

            jest.restoreAllMocks();

            const rowAfter = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(rowAfter?.updated_at).not.toBe(rowBefore?.updated_at);
        });

        it('should preserve created_at timestamp', () => {
            const stored = storeKnowledgeDirect(db, validInput);
            const rowBefore = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);

            updateKnowledgeDirect(db, {
                id: stored.id,
                tags: ['refreshed'],
            });

            const rowAfter = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(rowAfter?.created_at).toBe(rowBefore?.created_at);
        });

        it('should recalculate normalized_title when title changes', () => {
            const stored = storeKnowledgeDirect(db, validInput);

            updateKnowledgeDirect(db, {
                id: stored.id,
                title: 'NEW Title  With  Spaces',
            });

            const row = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(row?.normalized_title).toBe('new title with spaces');
        });

        it('should recalculate content_hash when content changes', () => {
            const stored = storeKnowledgeDirect(db, validInput);
            const rowBefore = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);

            updateKnowledgeDirect(db, {
                id: stored.id,
                content: 'Completely different content that should produce a different hash value when processed by the normalizer and hasher.',
            });

            const rowAfter = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(rowAfter?.content_hash).not.toBe(rowBefore?.content_hash);
        });
    });

    describe('not found errors', () => {
        it('should throw NotFoundError for non-existent ID', () => {
            expect(() => updateKnowledgeDirect(db, {
                id: 'non-existent-id',
                title: 'Some new title that is valid',
            })).toThrow(NotFoundError);
        });
    });

    describe('validation errors', () => {
        it('should throw ValidationError when no update fields provided', () => {
            const stored = storeKnowledgeDirect(db, validInput);
            expect(() => updateKnowledgeDirect(db, {
                id: stored.id,
            })).toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid title', () => {
            const stored = storeKnowledgeDirect(db, validInput);
            expect(() => updateKnowledgeDirect(db, {
                id: stored.id,
                title: 'Short',
            })).toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid content', () => {
            const stored = storeKnowledgeDirect(db, validInput);
            expect(() => updateKnowledgeDirect(db, {
                id: stored.id,
                content: 'Too short',
            })).toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid tags', () => {
            const stored = storeKnowledgeDirect(db, validInput);
            expect(() => updateKnowledgeDirect(db, {
                id: stored.id,
                tags: ['invalid tag with spaces'],
            })).toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid scope', () => {
            const stored = storeKnowledgeDirect(db, validInput);
            expect(() => updateKnowledgeDirect(db, {
                id: stored.id,
                scope: 'bad-scope',
            })).toThrow(ValidationError);
        });
    });

    describe('duplicate detection', () => {
        it('should throw DuplicateError when updated title conflicts with another item', () => {
            storeKnowledgeDirect(db, validInput);
            const stored2 = storeKnowledgeDirect(db, validInput2);

            expect(() => updateKnowledgeDirect(db, {
                id: stored2.id,
                title: validInput.title,
            })).toThrow(DuplicateError);
        });

        it('should throw DuplicateError when updated content conflicts with another item', () => {
            storeKnowledgeDirect(db, validInput);
            const stored2 = storeKnowledgeDirect(db, validInput2);

            expect(() => updateKnowledgeDirect(db, {
                id: stored2.id,
                content: validInput.content,
            })).toThrow(DuplicateError);
        });

        it('should NOT throw duplicate error when title matches self', () => {
            const stored = storeKnowledgeDirect(db, validInput);

            const result = updateKnowledgeDirect(db, {
                id: stored.id,
                title: validInput.title,
                tags: ['new-tag'],
            });

            expect(result.success).toBe(true);
        });

        it('should NOT throw duplicate error when content matches self', () => {
            const stored = storeKnowledgeDirect(db, validInput);

            const result = updateKnowledgeDirect(db, {
                id: stored.id,
                content: validInput.content,
                tags: ['new-tag'],
            });

            expect(result.success).toBe(true);
        });
    });
});
