import type { DatabaseConnection } from '../database/index.js';

export interface RawSearchRow {
    id: string;
    title: string;
    content: string;
    tags: string;
    scope: string;
    bm25_score: number;
    token_coverage?: number;
}

export function searchStrict(
    db: DatabaseConnection,
    ftsQuery: string,
    scope: string | undefined,
    limit: number,
): RawSearchRow[] {
    const { sql, params } = buildSearchQuery(ftsQuery, scope, limit);
    return db.query<RawSearchRow>(sql, params);
}

export function searchBroad(
    db: DatabaseConnection,
    ftsQuery: string,
    tokens: string[],
    scope: string | undefined,
    limit: number,
): RawSearchRow[] {
    const { sql, params } = buildBroadSearchQuery(ftsQuery, tokens, scope, limit);
    return db.query<RawSearchRow>(sql, params);
}

export function searchRecent(
    db: DatabaseConnection,
    scope: string | undefined,
    limit: number,
): RawSearchRow[] {
    const { sql, params } = buildSimpleQuery(scope, limit);
    return db.query<RawSearchRow>(sql, params);
}

/**
 * Build FTS5 query with column boosting.
 * Uses bm25() with weights: title=10, content=5, tags=1.
 */
export function buildSearchQuery(
    ftsQuery: string,
    scope?: string | null,
    limit = 5,
): { sql: string; params: unknown[] } {
    const params: unknown[] = [];

    let sql = `
    SELECT 
      k.id,
      k.title,
      k.content,
      k.tags,
      k.scope,
      k.created_at,
      k.updated_at,
      bm25(knowledge_fts, 10.0, 5.0, 1.0) as bm25_score,
      1.0 as token_coverage
    FROM knowledge k
    JOIN knowledge_fts fts ON k.rowid = fts.rowid
    WHERE knowledge_fts MATCH ?
  `;
    params.push(ftsQuery);

    if (scope) {
        sql += ` AND (k.scope = ? OR k.scope = 'global')`;
        params.push(scope);
    }

    sql += ` ORDER BY bm25_score LIMIT ?`;
    params.push(limit);

    return { sql, params };
}

export function buildBroadSearchQuery(
    ftsQuery: string,
    tokens: string[],
    scope?: string | null,
    limit = 5,
): { sql: string; params: unknown[] } {
    const tokenMatches = tokens.map(() =>
        '(CASE WHEN k.rowid IN (SELECT rowid FROM knowledge_fts WHERE knowledge_fts MATCH ?) THEN 1 ELSE 0 END)',
    ).join(' + ');
    const params: unknown[] = tokens.map(token => `"${token}"*`);
    let sql = `
    SELECT
      k.id, k.title, k.content, k.tags, k.scope, k.created_at, k.updated_at,
      bm25(knowledge_fts, 10.0, 5.0, 1.0) as bm25_score,
      CAST((${tokenMatches}) AS REAL) / ${tokens.length} as token_coverage
    FROM knowledge k
    JOIN knowledge_fts fts ON k.rowid = fts.rowid
    WHERE knowledge_fts MATCH ?
  `;
    params.push(ftsQuery);

    if (scope) {
        sql += ` AND (k.scope = ? OR k.scope = 'global')`;
        params.push(scope);
    }

    sql += ` ORDER BY token_coverage DESC, bm25_score LIMIT ?`;
    params.push(limit);
    return { sql, params };
}

/**
 * Build simple search query without FTS for recent fallback.
 */
export function buildSimpleQuery(
    scope?: string | null,
    limit = 5,
): { sql: string; params: unknown[] } {
    const params: unknown[] = [];

    let sql = `
    SELECT 
      id, title, content, tags, scope, created_at, updated_at,
      0 as bm25_score,
      1.0 as token_coverage
    FROM knowledge
  `;

    if (scope) {
        sql += ` WHERE scope = ? OR scope = 'global'`;
        params.push(scope);
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    return { sql, params };
}
