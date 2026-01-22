/**
 * FTS5 Query Builder
 * Converts natural language queries to FTS5 match expressions
 */

/**
 * Escape special FTS5 characters to prevent query syntax errors
 */
function escapeFtsSpecialChars(text: string): string {
    // FTS5 special characters: " * ^ - : OR AND NOT ( )
    return text
        .replace(/"/g, '""')  // Escape quotes by doubling
        .replace(/[*^():\-]/g, ' ')  // Replace operators with space (including hyphen)
        .replace(/\b(AND|OR|NOT)\b/gi, '')  // Remove boolean operators
        .trim()
        .replace(/\s+/g, ' ');  // Collapse multiple spaces
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
    const escaped = escapeFtsSpecialChars(query);
    const words = escaped.split(/\s+/).filter(w => w.length > 0);

    if (words.length === 0) {
        return '';
    }

    // Use prefix matching for each word
    // This allows "api design" to match "API", "designing", etc.
    return words.map(word => `${word}*`).join(' ');
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
      bm25(knowledge_fts, 10.0, 5.0, 1.0) as bm25_score
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
      0 as bm25_score
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
