/**
 * FTS5 Query Builder
 * Converts natural language queries to FTS5 match expressions
 */

const STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'do', 'does',
    'for', 'from', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'is', 'it', 'of',
    'on', 'or', 'should', 'that', 'the', 'their', 'this', 'to', 'was', 'what',
    'when', 'where', 'which', 'who', 'why', 'will', 'with', 'you', 'your',
]);

export function normalizeSearchTokens(query: string): string[] {
    const matches = query.normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? [];
    const seen = new Set<string>();

    return matches.flatMap(token => {
        const normalized = token.toLowerCase();
        if (normalized.length === 1 || STOPWORDS.has(normalized) || seen.has(normalized)) {
            return [];
        }
        seen.add(normalized);
        return [normalized];
    });
}

function buildPrefixTerms(query: string): string[] {
    return normalizeSearchTokens(query).map(token => `"${token}"*`);
}

/**
 * Build FTS5 query from natural language input
 * 
 * Strategy:
 * - Split query into words
 * - Use prefix matching (*) for partial matches
 * - Escape special characters
 */
export function buildFtsQuery(query: string): string {
    return buildPrefixTerms(query).join(' ');
}

export function buildBroadFtsQuery(query: string): string {
    return buildPrefixTerms(query).join(' OR ');
}

/**
 * Build FTS5 query with column boosting
 * Uses bm25() with weights: title=10, content=5, tags=1
 */
export function buildSearchQuery(
    ftsQuery: string,
    scope?: string | null,
    limit = 5
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
    limit = 5
): { sql: string; params: unknown[] } {
    const tokenMatches = tokens.map(() =>
        '(CASE WHEN k.rowid IN (SELECT rowid FROM knowledge_fts WHERE knowledge_fts MATCH ?) THEN 1 ELSE 0 END)'
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
 * Build simple search query without FTS (fallback for empty queries)
 */
export function buildSimpleQuery(
    scope?: string | null,
    limit = 5
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
