import { getDatabase } from '../database/index.js';
import { ValidationError } from '../domain/knowledge/errors.js';
import { rankResults } from '../domain/knowledge/ranking.js';
import {
    buildBroadFtsQuery,
    buildFtsQuery,
    normalizeSearchTokens,
} from '../domain/knowledge/search-query.js';
import { searchBroad, searchRecent, searchStrict, type RawSearchRow } from '../repositories/search.repository.js';
import type { SearchKnowledgeInput, SearchKnowledgeResult } from '../domain/knowledge/types.js';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 500;
const BROAD_CANDIDATE_MULTIPLIER = 4;

export function searchKnowledge(input: SearchKnowledgeInput): SearchKnowledgeResult {
    validateSearchInput(input);

    const db = getDatabase();
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const ftsQuery = buildFtsQuery(input.query);
    const tokens = normalizeSearchTokens(input.query);

    let rows: RawSearchRow[];
    let strategy: SearchKnowledgeResult['strategy'];

    if (ftsQuery === '') {
        rows = searchRecent(db, input.scope, limit);
        strategy = 'recent';
    } else {
        rows = searchStrict(db, ftsQuery, input.scope, limit * 2);
        strategy = 'strict';

        if (rows.length === 0 && tokens.length >= 2) {
            const broadQuery = buildBroadFtsQuery(input.query);
            rows = searchBroad(
                db,
                broadQuery,
                tokens,
                input.scope,
                limit * BROAD_CANDIDATE_MULTIPLIER,
            );
            strategy = 'broad';
        }
    }

    const ranked = rankResults(rows, {
        contextTags: input.contextTags,
        queryScope: input.scope,
    });

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
