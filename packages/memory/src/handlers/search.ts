import { getDatabase } from '../database/index.js';
import {
    buildBroadFtsQuery,
    buildBroadSearchQuery,
    buildFtsQuery,
    buildSearchQuery,
    buildSimpleQuery,
    normalizeSearchTokens,
} from '../services/search.js';
import { rankResults } from '../services/ranker.js';
import { ValidationError } from '../utils/errors.js';
import type { SearchKnowledgeInput, SearchKnowledgeResult } from '../types/index.js';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 500;
const BROAD_CANDIDATE_MULTIPLIER = 4;

interface RawSearchRow {
    id: string;
    title: string;
    content: string;
    tags: string;
    scope: string;
    bm25_score: number;
    token_coverage?: number;
}

export function searchKnowledge(input: SearchKnowledgeInput): SearchKnowledgeResult {
    validateSearchInput(input);

    const db = getDatabase();
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const ftsQuery = buildFtsQuery(input.query);
    const tokens = normalizeSearchTokens(input.query);

    let rows: RawSearchRow[];
    let strategy: SearchKnowledgeResult['strategy'];

    if (ftsQuery === '') {
        // A query containing no searchable terms returns recent items.
        const { sql, params } = buildSimpleQuery(input.scope, limit);
        rows = db.query<RawSearchRow>(sql, params);
        strategy = 'recent';
    } else {
        // Full-text search with BM25
        const { sql, params } = buildSearchQuery(ftsQuery, input.scope, limit * 2);

        rows = db.query<RawSearchRow>(sql, params);
        strategy = 'strict';

        if (rows.length === 0 && tokens.length >= 2) {
            const broadQuery = buildBroadFtsQuery(input.query);
            const broad = buildBroadSearchQuery(
                broadQuery,
                tokens,
                input.scope,
                limit * BROAD_CANDIDATE_MULTIPLIER,
            );
            rows = db.query<RawSearchRow>(broad.sql, broad.params);
            strategy = 'broad';
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
        strategy,
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
