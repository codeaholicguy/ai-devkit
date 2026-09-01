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
