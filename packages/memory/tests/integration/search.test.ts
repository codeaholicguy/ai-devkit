import { join } from 'path';
import { tmpdir } from 'os';
import { unlinkSync, existsSync } from 'fs';
import { DatabaseConnection } from '../../src/database/connection';
import { initializeSchema } from '../../src/database/schema';
import { ValidationError } from '../../src/utils/errors';
import { buildFtsQuery, buildSearchQuery, buildSimpleQuery } from '../../src/services/search';
import { rankResults } from '../../src/services/ranker';
import { normalizeTitle, normalizeScope, normalizeTags, hashContent } from '../../src/services/normalizer';
import { v4 as uuidv4 } from 'uuid';

// Direct search for testing
function searchKnowledgeDirect(db: DatabaseConnection, input: {
    query: string;
    contextTags?: string[];
    scope?: string;
    limit?: number;
}) {
    if (!input.query || input.query.trim().length < 3) {
        throw new ValidationError('Query must be at least 3 characters', {});
    }
    if (input.query.length > 500) {
        throw new ValidationError('Query must be at most 500 characters', {});
    }

    const limit = Math.min(Math.max(input.limit ?? 5, 1), 20);
    const ftsQuery = buildFtsQuery(input.query);

    let rows: any[];
    if (ftsQuery === '') {
        const { sql, params } = buildSimpleQuery(input.scope, limit);
        rows = db.query(sql, params);
    } else {
        const { sql, params } = buildSearchQuery(ftsQuery, input.scope, limit * 2);
        try {
            rows = db.query(sql, params);
        } catch {
            const { sql: fallbackSql, params: fallbackParams } = buildSimpleQuery(input.scope, limit);
            rows = db.query(fallbackSql, fallbackParams);
        }
    }

    const ranked = rankResults(rows, { contextTags: input.contextTags, queryScope: input.scope });
    return { results: ranked.slice(0, limit), totalMatches: ranked.length, query: input.query };
}

// Direct store for seeding
function storeKnowledgeDirect(db: DatabaseConnection, input: {
    title: string;
    content: string;
    tags?: string[];
    scope?: string;
}) {
    const now = new Date().toISOString();
    const id = uuidv4();
    const normalizedTitle = normalizeTitle(input.title);
    const scope = normalizeScope(input.scope);
    const tags = normalizeTags(input.tags ?? []);
    const contentHash = hashContent(input.content);

    db.execute(
        `INSERT INTO knowledge (id, title, content, tags, scope, normalized_title, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.title.trim(), input.content.trim(), JSON.stringify(tags), scope, normalizedTitle, contentHash, now, now]
    );
    return { id };
}

describe('search handler', () => {
    const testDbPath = join(tmpdir(), `test-search-${Date.now()}-${Math.random().toString(36)}.db`);
    let db: DatabaseConnection;

    const seedData = [
        {
            title: 'Always use Response DTOs for API endpoints',
            content: 'When building REST APIs, always use Response DTOs instead of returning domain entities directly. This provides better API versioning.',
            tags: ['api', 'backend', 'dto'],
            scope: 'global',
        },
        {
            title: 'Use dependency injection for better testability',
            content: 'All services should receive their dependencies through constructor injection. This makes unit testing easier.',
            tags: ['testing', 'architecture', 'di'],
            scope: 'global',
        },
        {
            title: 'Project specific API versioning strategy',
            content: 'In this project we use URL-based versioning for APIs. All endpoints prefixed with /v1/, /v2/, etc.',
            tags: ['api', 'versioning'],
            scope: 'project:myapp',
        },
    ];

    beforeAll(() => {
        db = new DatabaseConnection({ dbPath: testDbPath });
        initializeSchema(db);
        for (const item of seedData) {
            storeKnowledgeDirect(db, item);
        }
    });

    afterAll(() => {
        db.close();
        try {
            if (existsSync(testDbPath)) unlinkSync(testDbPath);
            if (existsSync(testDbPath + '-wal')) unlinkSync(testDbPath + '-wal');
            if (existsSync(testDbPath + '-shm')) unlinkSync(testDbPath + '-shm');
        } catch { }
    });

    describe('basic search', () => {
        it('should find relevant results for query', () => {
            const result = searchKnowledgeDirect(db, { query: 'API endpoint' });
            expect(result.results.length).toBeGreaterThan(0);
            expect(result.query).toBe('API endpoint');
        });

        it('should return results with required fields', () => {
            const result = searchKnowledgeDirect(db, { query: 'testing' });
            const first = result.results[0];
            expect(first).toHaveProperty('id');
            expect(first).toHaveProperty('title');
            expect(first).toHaveProperty('content');
            expect(first).toHaveProperty('tags');
            expect(first).toHaveProperty('scope');
            expect(first).toHaveProperty('score');
        });

        it('should respect limit parameter', () => {
            const result = searchKnowledgeDirect(db, { query: 'API', limit: 1 });
            expect(result.results.length).toBeLessThanOrEqual(1);
        });
    });

    describe('ranking', () => {
        it('should rank API-specific rules in top results for API queries', () => {
            const result = searchKnowledgeDirect(db, { query: 'building API endpoint' });
            const topTitles = result.results.slice(0, 3).map(r => r.title.toLowerCase());
            const hasApiResult = topTitles.some(t => t.includes('api'));
            expect(hasApiResult).toBe(true);
        });

        it('should prioritize project scope when specified', () => {
            const result = searchKnowledgeDirect(db, { query: 'API versioning', scope: 'project:myapp' });
            const projectResult = result.results.find(r => r.scope === 'project:myapp');
            const globalResult = result.results.find(r => r.scope === 'global');
            if (projectResult && globalResult) {
                expect(projectResult.score).toBeGreaterThan(globalResult.score);
            }
        });
    });

    describe('validation', () => {
        it('should reject query shorter than 3 chars', () => {
            expect(() => searchKnowledgeDirect(db, { query: 'ab' })).toThrow(ValidationError);
        });

        it('should reject query longer than 500 chars', () => {
            expect(() => searchKnowledgeDirect(db, { query: 'a'.repeat(501) })).toThrow(ValidationError);
        });
    });

    describe('empty results', () => {
        it('should return empty array for no matches', () => {
            const result = searchKnowledgeDirect(db, { query: 'xyznonexistent123' });
            expect(result.results).toEqual([]);
            expect(result.totalMatches).toBe(0);
        });
    });
});
