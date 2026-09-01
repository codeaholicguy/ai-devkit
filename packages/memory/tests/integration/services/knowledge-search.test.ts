import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';
import { closeDatabase, getDatabase, type DatabaseConnection } from '../../../src/database';
import { ValidationError } from '../../../src/domain/knowledge/errors';
import { buildBroadFtsQuery, buildFtsQuery, normalizeSearchTokens } from '../../../src/domain/knowledge/search-query';
import { buildBroadSearchQuery, buildSearchQuery, buildSimpleQuery } from '../../../src/repositories/search.repository';
import { rankResults } from '../../../src/domain/knowledge/ranking';
import { storeKnowledge } from '../../../src/services/knowledge.service';
import { searchKnowledge } from '../../../src/services/search.service';

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
        db = getDatabase({ dbPath: testDbPath });
        for (const item of seedData) {
            storeKnowledge(item);
        }
    });

    afterAll(() => {
        closeDatabase();
        rmSync(testDbPath, { force: true });
        rmSync(testDbPath + '-wal', { force: true });
        rmSync(testDbPath + '-shm', { force: true });
    });

    describe('basic search', () => {
        it('should find relevant results for query', () => {
            const result = searchKnowledge({ query: 'API endpoint' });
            expect(result.results.length).toBeGreaterThan(0);
            expect(result.query).toBe('API endpoint');
        });

        it('should return results with required fields', () => {
            const result = searchKnowledge({ query: 'testing' });
            const first = result.results[0];
            expect(first).toHaveProperty('id');
            expect(first).toHaveProperty('title');
            expect(first).toHaveProperty('content');
            expect(first).toHaveProperty('tags');
            expect(first).toHaveProperty('scope');
            expect(first).toHaveProperty('score');
        });

        it('should respect limit parameter', () => {
            const result = searchKnowledge({ query: 'API', limit: 1 });
            expect(result.results.length).toBeLessThanOrEqual(1);
        });
    });

    describe('ranking', () => {
        it('executes broad SQL and exposes token coverage for partial sentence matches', () => {
            const query = 'How should API schema migrations work';
            const tokens = normalizeSearchTokens(query);
            const { sql, params } = buildBroadSearchQuery(buildBroadFtsQuery(query), tokens, undefined, 10);

            const rows = db.query<any>(sql, params);

            expect(rows.length).toBeGreaterThan(0);
            expect(rows.every(row => row.token_coverage > 0 && row.token_coverage <= 1)).toBe(true);
        });

        it('should rank API-specific rules in top results for API queries', () => {
            const result = searchKnowledge({ query: 'building API endpoint' });
            const topTitles = result.results.slice(0, 3).map(r => r.title.toLowerCase());
            const hasApiResult = topTitles.some(t => t.includes('api'));
            expect(hasApiResult).toBe(true);
        });

        it('should prioritize project scope when specified', () => {
            const result = searchKnowledge({ query: 'API versioning', scope: 'project:myapp' });
            const projectResult = result.results.find(r => r.scope === 'project:myapp');
            const globalResult = result.results.find(r => r.scope === 'global');
            if (projectResult && globalResult) {
                expect(projectResult.score).toBeGreaterThan(globalResult.score);
            }
        });
    });

    describe('validation', () => {
        it('should reject query shorter than 3 chars', () => {
            expect(() => searchKnowledge({ query: 'ab' })).toThrow(ValidationError);
        });

        it('should reject query longer than 500 chars', () => {
            expect(() => searchKnowledge({ query: 'a'.repeat(501) })).toThrow(ValidationError);
        });
    });

    describe('empty results', () => {
        it('should return empty array for no matches', () => {
            const result = searchKnowledge({ query: 'xyznonexistent123' });
            expect(result.results).toEqual([]);
            expect(result.totalMatches).toBe(0);
        });
    });
});
