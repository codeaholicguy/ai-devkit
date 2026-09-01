import {
    buildBroadFtsQuery,
    buildFtsQuery,
    normalizeSearchTokens,
} from '../../../../src/domain/knowledge/search-query';

describe('search query builders', () => {
    it.each([
        ['How should I change SQLite migrations?', '"change"* "sqlite"* "migrations"*'],
        ['Use “quoted values” and don\'t fail.', '"use"* "quoted"* "values"* "don"* "fail"*'],
        ['error-handling /tmp/memory.db', '"error"* "handling"* "tmp"* "memory"* "db"*'],
        ['C:\\repo\\node_modules\\@ai-devkit\\memory', '"repo"* "node"* "modules"* "ai"* "devkit"* "memory"*'],
        ['@ai-devkit/memory search.ts', '"ai"* "devkit"* "memory"* "search"* "ts"*'],
    ])('builds a safe strict query for %s', (query, expected) => {
        expect(buildFtsQuery(query)).toBe(expected);
    });

    it('removes small English stopwords, one-character noise, and duplicate tokens', () => {
        expect(normalizeSearchTokens('How do I use API api v2 in a project?')).toEqual([
            'use', 'api', 'v2', 'project',
        ]);
    });

    it('returns no terms for noise-only input', () => {
        expect(buildFtsQuery('How do I do this?')).toBe('');
        expect(normalizeSearchTokens('???')).toEqual([]);
    });

    it('builds an explicit OR query from the same normalized terms', () => {
        expect(buildBroadFtsQuery('How should SQLite migrations change?')).toBe(
            '"sqlite"* OR "migrations"* OR "change"*',
        );
    });
});
