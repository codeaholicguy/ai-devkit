import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';
import { closeDatabase, getDatabase, type DatabaseConnection } from '../../../src/database';
import { ValidationError, DuplicateError, NotFoundError } from '../../../src/domain/knowledge/errors';
import { storeKnowledge, updateKnowledge } from '../../../src/services/knowledge.service';
import type { KnowledgeRow } from '../../../src/domain/knowledge/types';

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

    describe('successful updates', () => {
        it('should update title only', () => {
            const stored = storeKnowledge(validInput);
            const result = updateKnowledge({
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
            const stored = storeKnowledge(validInput);
            const newContent = 'Updated content that is long enough to pass validation rules. This replaces the old content entirely with new information.';
            const result = updateKnowledge({
                id: stored.id,
                content: newContent,
            });

            expect(result.success).toBe(true);

            const row = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(row?.content).toBe(newContent);
            expect(row?.title).toBe(validInput.title);
        });

        it('should update tags only', () => {
            const stored = storeKnowledge(validInput);
            const result = updateKnowledge({
                id: stored.id,
                tags: ['new-tag', 'updated'],
            });

            expect(result.success).toBe(true);

            const row = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(JSON.parse(row?.tags || '[]')).toEqual(['new-tag', 'updated']);
        });

        it('should update scope only', () => {
            const stored = storeKnowledge(validInput);
            const result = updateKnowledge({
                id: stored.id,
                scope: 'project:my-app',
            });

            expect(result.success).toBe(true);

            const row = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(row?.scope).toBe('project:my-app');
        });

        it('should update multiple fields at once', () => {
            const stored = storeKnowledge(validInput);
            const newTitle = 'Completely new title for this item';
            const newContent = 'Completely new content for this knowledge item that is long enough to pass the validation rules set in the validator.';
            const result = updateKnowledge({
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
            const stored = storeKnowledge(validInput);
            const rowBefore = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);

            // Mock Date to return a future timestamp to avoid same-millisecond flakiness
            const futureDate = new Date(Date.now() + 1000);
            vi.spyOn(global, 'Date').mockImplementation(function () { return futureDate as unknown as Date; });

            updateKnowledge({
                id: stored.id,
                tags: ['refreshed'],
            });

            vi.restoreAllMocks();

            const rowAfter = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(rowAfter?.updated_at).not.toBe(rowBefore?.updated_at);
        });

        it('should preserve created_at timestamp', () => {
            const stored = storeKnowledge(validInput);
            const rowBefore = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);

            updateKnowledge({
                id: stored.id,
                tags: ['refreshed'],
            });

            const rowAfter = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(rowAfter?.created_at).toBe(rowBefore?.created_at);
        });

        it('should recalculate normalized_title when title changes', () => {
            const stored = storeKnowledge(validInput);

            updateKnowledge({
                id: stored.id,
                title: 'NEW Title  With  Spaces',
            });

            const row = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(row?.normalized_title).toBe('new title with spaces');
        });

        it('should recalculate content_hash when content changes', () => {
            const stored = storeKnowledge(validInput);
            const rowBefore = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);

            updateKnowledge({
                id: stored.id,
                content: 'Completely different content that should produce a different hash value when processed by the normalizer and hasher.',
            });

            const rowAfter = db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [stored.id]);
            expect(rowAfter?.content_hash).not.toBe(rowBefore?.content_hash);
        });
    });

    describe('not found errors', () => {
        it('should throw NotFoundError for non-existent ID', () => {
            expect(() => updateKnowledge({
                id: 'non-existent-id',
                title: 'Some new title that is valid',
            })).toThrow(NotFoundError);
        });
    });

    describe('validation errors', () => {
        it('should throw ValidationError when no update fields provided', () => {
            const stored = storeKnowledge(validInput);
            expect(() => updateKnowledge({
                id: stored.id,
            })).toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid title', () => {
            const stored = storeKnowledge(validInput);
            expect(() => updateKnowledge({
                id: stored.id,
                title: 'Short',
            })).toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid content', () => {
            const stored = storeKnowledge(validInput);
            expect(() => updateKnowledge({
                id: stored.id,
                content: 'Too short',
            })).toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid tags', () => {
            const stored = storeKnowledge(validInput);
            expect(() => updateKnowledge({
                id: stored.id,
                tags: ['invalid tag with spaces'],
            })).toThrow(ValidationError);
        });

        it('should throw ValidationError for invalid scope', () => {
            const stored = storeKnowledge(validInput);
            expect(() => updateKnowledge({
                id: stored.id,
                scope: 'bad-scope',
            })).toThrow(ValidationError);
        });
    });

    describe('duplicate detection', () => {
        it('should throw DuplicateError when updated title conflicts with another item', () => {
            storeKnowledge(validInput);
            const stored2 = storeKnowledge(validInput2);

            expect(() => updateKnowledge({
                id: stored2.id,
                title: validInput.title,
            })).toThrow(DuplicateError);
        });

        it('should throw DuplicateError when updated content conflicts with another item', () => {
            storeKnowledge(validInput);
            const stored2 = storeKnowledge(validInput2);

            expect(() => updateKnowledge({
                id: stored2.id,
                content: validInput.content,
            })).toThrow(DuplicateError);
        });

        it('should NOT throw duplicate error when title matches self', () => {
            const stored = storeKnowledge(validInput);

            const result = updateKnowledge({
                id: stored.id,
                title: validInput.title,
                tags: ['new-tag'],
            });

            expect(result.success).toBe(true);
        });

        it('should NOT throw duplicate error when content matches self', () => {
            const stored = storeKnowledge(validInput);

            const result = updateKnowledge({
                id: stored.id,
                content: validInput.content,
                tags: ['new-tag'],
            });

            expect(result.success).toBe(true);
        });
    });
});
