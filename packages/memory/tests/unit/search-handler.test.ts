import { vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../../src/database/index.js', () => ({
    getDatabase: () => ({ query }),
}));

import { searchKnowledge } from '../../src/handlers/search';
import { ValidationError } from '../../src/utils/errors';

describe('searchKnowledge error handling', () => {
    beforeEach(() => query.mockReset());

    it('surfaces an FTS database error instead of returning recent items', () => {
        const failure = new Error('malformed MATCH expression');
        query.mockImplementationOnce(() => { throw failure; });
        query.mockReturnValueOnce([]);

        let thrown: unknown;
        try {
            searchKnowledge({ query: 'sqlite migration' });
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBe(failure);
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('returns strict metadata without a broad query when strict retrieval succeeds', () => {
        query.mockReturnValueOnce([makeRow('strict')]);

        const result = searchKnowledge({ query: 'sqlite migration' });

        expect(result.strategy).toBe('strict');
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('retries an empty strict search with a larger broad candidate pool', () => {
        query.mockReturnValueOnce([]).mockReturnValueOnce([makeRow('broad', 0.5)]);

        const result = searchKnowledge({ query: 'How should SQLite schema changes work?', limit: 5 });

        expect(result.strategy).toBe('broad');
        expect(result.results[0].id).toBe('broad');
        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[1][1].at(-1)).toBe(20);
    });

    it('does not add a fallback for a single meaningful token', () => {
        query.mockReturnValueOnce([]);

        const result = searchKnowledge({ query: 'sqlite' });

        expect(result.strategy).toBe('strict');
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('returns recent metadata for a noise-only query', () => {
        query.mockReturnValueOnce([makeRow('recent')]);

        const result = searchKnowledge({ query: 'How do I do this?' });

        expect(result.strategy).toBe('recent');
        expect(query).toHaveBeenCalledTimes(1);
    });

    it.each([
        [{ query: '' }, 'Query is required'],
        [{ query: 'ab' }, 'Query must be at least 3 characters'],
        [{ query: 'x'.repeat(501) }, 'Query must be at most 500 characters'],
        [{ query: 'valid', limit: 0 }, 'Limit must be a positive number'],
        [{ query: 'valid', limit: 'bad' as unknown as number }, 'Limit must be a positive number'],
    ])('validates invalid search input %#', (input, message) => {
        expect(() => searchKnowledge(input)).toThrow(new ValidationError(message, { errors: [message] }));
        expect(query).not.toHaveBeenCalled();
    });
});

function makeRow(id: string, tokenCoverage = 1) {
    return {
        id,
        title: `${id} title`,
        content: `${id} content`,
        tags: '[]',
        scope: 'global',
        bm25_score: -1,
        token_coverage: tokenCoverage,
    };
}
