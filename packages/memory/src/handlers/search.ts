import { getDatabase } from '../database';
import { buildFtsQuery, buildSearchQuery, buildSimpleQuery } from '../services/search';
import { rankResults } from '../services/ranker';
import { ValidationError } from '../utils/errors';
import type { SearchKnowledgeInput, SearchKnowledgeResult } from '../types';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 500;

interface RawSearchRow {
    id: string;
    title: string;
    content: string;
    tags: string;
    scope: string;
    bm25_score: number;
}

export function searchKnowledge(input: SearchKnowledgeInput): SearchKnowledgeResult {
    validateSearchInput(input);

    const db = getDatabase();
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const ftsQuery = buildFtsQuery(input.query);

    let rows: RawSearchRow[];

    if (ftsQuery === '') {
        // Empty or invalid query - return recent items
        const { sql, params } = buildSimpleQuery(input.scope, limit);
        rows = db.query<RawSearchRow>(sql, params);
    } else {
        // Full-text search with BM25
        const { sql, params } = buildSearchQuery(ftsQuery, input.scope, limit * 2);

        try {
            rows = db.query<RawSearchRow>(sql, params);
        } catch (error) {
            // FTS query syntax error - fallback to simple query
            const { sql: fallbackSql, params: fallbackParams } = buildSimpleQuery(input.scope, limit);
            rows = db.query<RawSearchRow>(fallbackSql, fallbackParams);
        }
    }

    // Apply ranking with tag and scope boosts
    const ranked = rankResults(rows, {
        contextTags: input.contextTags,
        queryScope: input.scope,
    });

    // Limit to requested count
    const results = ranked.slice(0, limit);

    return {
        results,
        totalMatches: ranked.length,
        query: input.query,
    };
}

function validateSearchInput(input: SearchKnowledgeInput): void {
    const errors: string[] = [];

    if (!input.query || typeof input.query !== 'string') {
        errors.push('Query is required');
    } else {
        const trimmed = input.query.trim();
        if (trimmed.length < MIN_QUERY_LENGTH) {
            errors.push(`Query must be at least ${MIN_QUERY_LENGTH} characters`);
        }
        if (trimmed.length > MAX_QUERY_LENGTH) {
            errors.push(`Query must be at most ${MAX_QUERY_LENGTH} characters`);
        }
    }

    if (input.limit !== undefined) {
        if (typeof input.limit !== 'number' || input.limit < 1) {
            errors.push('Limit must be a positive number');
        }
    }

    if (errors.length > 0) {
        throw new ValidationError(errors.join('; '), { errors });
    }
}
