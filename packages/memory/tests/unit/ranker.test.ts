import { rankResults } from '../../src/services/ranker';

describe('ranker', () => {
    const makeResult = (overrides: Partial<{
        id: string;
        title: string;
        content: string;
        tags: string;
        scope: string;
        bm25_score: number;
    }> = {}) => ({
        id: 'test-id',
        title: 'Test Title',
        content: 'Test content',
        tags: '["api", "backend"]',
        scope: 'global',
        bm25_score: -1.5, // BM25 returns negative, closer to 0 = better
        ...overrides,
    });

    describe('rankResults', () => {
        it('should return empty array for empty input', () => {
            const results = rankResults([], {});
            expect(results).toEqual([]);
        });

        it('should parse tags from JSON string', () => {
            const results = rankResults([makeResult()], {});
            expect(results[0].tags).toEqual(['api', 'backend']);
        });

        it('should handle invalid JSON tags gracefully', () => {
            const results = rankResults([makeResult({ tags: 'invalid json' })], {});
            expect(results[0].tags).toEqual([]);
        });

        it('should negate BM25 score (higher = better)', () => {
            const results = rankResults([makeResult({ bm25_score: -2.0 })], {});
            expect(results[0].score).toBeGreaterThan(0);
        });

        it('should apply tag boost for matching contextTags', () => {
            const baseResult = makeResult({ tags: '["api"]', bm25_score: -1.0 });

            const withoutContext = rankResults([baseResult], { contextTags: [] });
            const withContext = rankResults([baseResult], { contextTags: ['api'] });

            expect(withContext[0].score).toBeGreaterThan(withoutContext[0].score);
        });

        it('should apply scope boost for matching scope', () => {
            const result = makeResult({ scope: 'project:myapp', bm25_score: -1.0 });

            const withoutScope = rankResults([result], {});
            const withScope = rankResults([result], { queryScope: 'project:myapp' });

            expect(withScope[0].score).toBeGreaterThan(withoutScope[0].score);
        });

        it('should apply global scope boost', () => {
            const result = makeResult({ scope: 'global', bm25_score: -1.0 });

            const ranked = rankResults([result], {});
            // Global gets +0.2 boost
            expect(ranked[0].score).toBeGreaterThan(1.0);
        });

        it('should sort by score descending', () => {
            const results = [
                makeResult({ id: 'low', bm25_score: -0.5 }),
                makeResult({ id: 'high', bm25_score: -2.0 }),
                makeResult({ id: 'mid', bm25_score: -1.0 }),
            ];

            const ranked = rankResults(results, {});

            expect(ranked[0].id).toBe('high');
            expect(ranked[1].id).toBe('mid');
            expect(ranked[2].id).toBe('low');
        });

        it('should prioritize project scope over global', () => {
            const results = [
                makeResult({ id: 'global', scope: 'global', bm25_score: -1.0 }),
                makeResult({ id: 'project', scope: 'project:myapp', bm25_score: -1.0 }),
            ];

            const ranked = rankResults(results, { queryScope: 'project:myapp' });

            // Project match gets +0.5, global gets +0.2
            expect(ranked[0].id).toBe('project');
        });
    });
});
