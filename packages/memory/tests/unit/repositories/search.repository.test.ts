import { buildBroadSearchQuery, buildSimpleQuery } from '../../../src/repositories/search.repository';

describe('search repository query builders', () => {
    it('builds parameterized broad SQL with per-token coverage', () => {
        const result = buildBroadSearchQuery(
            '"sqlite"* OR "migration"*',
            ['sqlite', 'migration'],
            'repo:ai-devkit',
            20,
        );

        expect(result.sql).toContain('as token_coverage');
        expect(result.sql).toContain("AND (k.scope = ? OR k.scope = 'global')");
        expect(result.sql).toContain('ORDER BY token_coverage DESC, bm25_score');
        expect(result.params).toEqual([
            '"sqlite"*', '"migration"*',
            '"sqlite"* OR "migration"*',
            'repo:ai-devkit',
            20,
        ]);
    });

    it('builds a scoped recent-items query', () => {
        const result = buildSimpleQuery('repo:ai-devkit', 3);
        expect(result.sql).toContain("WHERE scope = ? OR scope = 'global'");
        expect(result.params).toEqual(['repo:ai-devkit', 3]);
    });
});
