import { getDatabase } from '../database/index.js';
import { buildFtsQuery } from '../services/search.js';
import { normalizeScope, normalizeTags } from '../services/normalizer.js';
import { ValidationError } from '../utils/errors.js';
import type { KnowledgeItem, KnowledgeRow, ListKnowledgeInput, ListKnowledgeResult, ListKnowledgeSort } from '../types/index.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_OFFSET = 100_000;
const MAX_QUERY_LENGTH = 500;

interface ListQuery {
    where: string[];
    params: unknown[];
}

export function listKnowledge(input: ListKnowledgeInput = {}): ListKnowledgeResult {
    validateListInput(input);

    const db = getDatabase();
    const limit = clampLimit(input.limit);
    const offset = clampOffset(input.offset);
    const query = buildListQuery(input);
    const orderBy = getOrderBy(input.sort);
    const whereSql = query.where.length > 0 ? `WHERE ${query.where.join(' AND ')}` : '';

    const totalRow = db.queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM knowledge k ${whereSql}`,
        query.params
    );

    const rows = db.query<KnowledgeRow>(
        `SELECT
           k.id,
           k.title,
           k.content,
           k.tags,
           k.scope,
           k.normalized_title,
           k.content_hash,
           k.created_at,
           k.updated_at
         FROM knowledge k
         ${whereSql}
         ${orderBy}
         LIMIT ? OFFSET ?`,
        [...query.params, limit, offset]
    );

    return {
        items: rows.map(mapKnowledgeRow),
        total: totalRow?.total ?? 0,
    };
}

function validateListInput(input: ListKnowledgeInput): void {
    const errors: string[] = [];

    if (input.query !== undefined && typeof input.query !== 'string') {
        errors.push('Query must be a string');
    }

    if (typeof input.query === 'string' && input.query.length > MAX_QUERY_LENGTH) {
        errors.push(`Query must be at most ${MAX_QUERY_LENGTH} characters`);
    }

    if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1)) {
        errors.push('Limit must be a positive integer');
    }

    if (input.offset !== undefined && (!Number.isInteger(input.offset) || input.offset < 0)) {
        errors.push('Offset must be a non-negative integer');
    }

    if (input.sort !== undefined && !isSupportedSort(input.sort)) {
        errors.push('Sort must be one of updated-desc, created-desc, or title-asc');
    }

    if (errors.length > 0) {
        throw new ValidationError(errors.join('; '), { errors });
    }
}

function buildListQuery(input: ListKnowledgeInput): ListQuery {
    const where: string[] = [];
    const params: unknown[] = [];
    const query = input.query?.trim();

    if (query) {
        const ftsQuery = buildFtsQuery(query);
        if (ftsQuery) {
            where.push(`k.rowid IN (
                SELECT rowid FROM knowledge_fts WHERE knowledge_fts MATCH ?
            )`);
            params.push(ftsQuery);
        }
    }

    if (input.scope) {
        where.push('k.scope = ?');
        params.push(normalizeScope(input.scope));
    }

    const tags = normalizeTags(input.tags ?? []);
    for (const tag of tags) {
        where.push('k.tags LIKE ?');
        params.push(`%"${tag}"%`);
    }

    return { where, params };
}

function mapKnowledgeRow(row: KnowledgeRow): KnowledgeItem {
    return {
        id: row.id,
        title: row.title,
        content: row.content,
        tags: parseTags(row.tags),
        scope: row.scope,
        normalizedTitle: row.normalized_title,
        contentHash: row.content_hash,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function parseTags(rawTags: string): string[] {
    try {
        const tags = JSON.parse(rawTags) as unknown;
        return Array.isArray(tags)
            ? tags.filter((tag): tag is string => typeof tag === 'string')
            : [];
    } catch {
        return [];
    }
}

function clampLimit(limit: number | undefined): number {
    return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function clampOffset(offset: number | undefined): number {
    return Math.min(Math.max(offset ?? 0, 0), MAX_OFFSET);
}

function getOrderBy(sort: ListKnowledgeSort | undefined): string {
    switch (sort) {
        case 'created-desc':
            return 'ORDER BY k.created_at DESC, k.title ASC';
        case 'title-asc':
            return 'ORDER BY k.title ASC, k.created_at DESC';
        case 'updated-desc':
        case undefined:
            return 'ORDER BY k.updated_at DESC, k.title ASC';
    }
}

function isSupportedSort(sort: string): sort is ListKnowledgeSort {
    return sort === 'updated-desc' || sort === 'created-desc' || sort === 'title-asc';
}
