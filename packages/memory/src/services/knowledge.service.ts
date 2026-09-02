import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/index.js';
import { DuplicateError, NotFoundError, StorageError, ValidationError } from '../domain/knowledge/errors.js';
import { mapKnowledgeRow, parseTags } from '../domain/knowledge/mapping.js';
import { hashContent, normalizeScope, normalizeTags, normalizeTitle } from '../domain/knowledge/normalize.js';
import { validateStoreInput, validateUpdateInput } from '../domain/knowledge/validate.js';
import {
    countKnowledgeRows,
    findKnowledgeByContentHash,
    findKnowledgeById,
    findKnowledgeByNormalizedTitle,
    getAllKnowledgeRows,
    getKnowledgeScopeCounts,
    insertKnowledge,
    listKnowledgeRows,
    updateKnowledgeRow,
    type StoredEmbedding,
} from '../repositories/knowledge.repository.js';
import type {
    KnowledgeRow,
    KnowledgeSummaryResult,
    ListKnowledgeInput,
    ListKnowledgeResult,
    StoreKnowledgeInput,
    StoreKnowledgeResult,
    UpdateKnowledgeInput,
    UpdateKnowledgeResult,
} from '../domain/knowledge/types.js';

const MAX_LIST_QUERY_LENGTH = 500;

type RecencyBucket = 'today' | 'week' | 'month' | 'older';

const RECENCY_BUCKETS: RecencyBucket[] = ['today', 'week', 'month', 'older'];

export function storeKnowledge(input: StoreKnowledgeInput, embedding?: StoredEmbedding): StoreKnowledgeResult {
    validateStoreInput(input);

    const db = getDatabase();
    const now = new Date().toISOString();
    const normalizedTitle = normalizeTitle(input.title);
    const scope = normalizeScope(input.scope);
    const tags = normalizeTags(input.tags ?? []);
    const contentHash = hashContent(input.content);
    const id = uuidv4();

    try {
        return db.transaction(() => {
            const existingByTitle = findKnowledgeByNormalizedTitle(db, normalizedTitle, scope);

            if (existingByTitle) {
                throw new DuplicateError(
                    'Knowledge with similar title already exists in this scope',
                    existingByTitle.id,
                    'title'
                );
            }

            const existingByHash = findKnowledgeByContentHash(db, contentHash, scope);

            if (existingByHash) {
                throw new DuplicateError(
                    'Knowledge with identical content already exists in this scope',
                    existingByHash.id,
                    'content'
                );
            }

            insertKnowledge(db, {
                id,
                title: input.title.trim(),
                content: input.content.trim(),
                tags,
                scope,
                normalizedTitle,
                contentHash,
                createdAt: now,
                updatedAt: now,
                embedding,
            });

            return {
                success: true,
                id,
                message: 'Knowledge stored successfully',
            };
        });
    } catch (error) {
        if (error instanceof DuplicateError) {
            throw error;
        }
        throw new StorageError(
            'Failed to store knowledge',
            { originalError: error instanceof Error ? error.message : String(error) }
        );
    }
}

export function updateKnowledge(input: UpdateKnowledgeInput, embedding?: StoredEmbedding): UpdateKnowledgeResult {
    validateUpdateInput(input);

    const db = getDatabase();
    const now = new Date().toISOString();

    try {
        return db.transaction(() => {
            const existing = findKnowledgeById(db, input.id);

            if (!existing) {
                throw new NotFoundError(`Knowledge item not found: ${input.id}`, input.id);
            }

            const title = input.title !== undefined ? input.title.trim() : existing.title;
            const content = input.content !== undefined ? input.content.trim() : existing.content;
            const tags = input.tags !== undefined ? normalizeTags(input.tags) : JSON.parse(existing.tags);
            const scope = input.scope !== undefined ? normalizeScope(input.scope) : existing.scope;
            const normalizedTitle = normalizeTitle(title);
            const contentHash = hashContent(content);
            const invalidatesEmbedding = input.title !== undefined
                || input.content !== undefined
                || input.tags !== undefined;

            const existingByTitle = findKnowledgeByNormalizedTitle(db, normalizedTitle, scope, input.id);

            if (existingByTitle) {
                throw new DuplicateError(
                    'Knowledge with similar title already exists in this scope',
                    existingByTitle.id,
                    'title'
                );
            }

            const existingByHash = findKnowledgeByContentHash(db, contentHash, scope, input.id);

            if (existingByHash) {
                throw new DuplicateError(
                    'Knowledge with identical content already exists in this scope',
                    existingByHash.id,
                    'content'
                );
            }

            updateKnowledgeRow(db, {
                id: input.id,
                title,
                content,
                tags,
                scope,
                normalizedTitle,
                contentHash,
                updatedAt: now,
                embedding: embedding?.value ?? (invalidatesEmbedding ? null : existing.embedding ?? null),
                embeddingVersion: embedding?.version ?? (invalidatesEmbedding ? null : existing.embedding_version ?? null),
            });

            return {
                success: true,
                id: input.id,
                message: 'Knowledge updated successfully',
            };
        });
    } catch (error) {
        if (error instanceof DuplicateError || error instanceof NotFoundError) {
            throw error;
        }
        throw new StorageError(
            'Failed to update knowledge',
            { originalError: error instanceof Error ? error.message : String(error) }
        );
    }
}

export function listKnowledge(input: ListKnowledgeInput = {}): ListKnowledgeResult {
    validateListInput(input);

    const db = getDatabase();
    const { rows, total } = listKnowledgeRows(db, input);

    return {
        items: rows.map(mapKnowledgeRow),
        total,
    };
}

export function getKnowledgeSummary(): KnowledgeSummaryResult {
    const db = getDatabase();
    const rows = getAllKnowledgeRows(db);

    return {
        totalItems: countKnowledgeRows(db),
        scopes: getKnowledgeScopeCounts(db),
        tags: buildTagCounts(rows),
        recency: buildRecencyCounts(rows),
    };
}

function validateListInput(input: ListKnowledgeInput): void {
    const errors: string[] = [];

    if (input.query !== undefined && typeof input.query !== 'string') {
        errors.push('Query must be a string');
    }

    if (typeof input.query === 'string' && input.query.length > MAX_LIST_QUERY_LENGTH) {
        errors.push(`Query must be at most ${MAX_LIST_QUERY_LENGTH} characters`);
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

function isSupportedSort(sort: string): sort is NonNullable<ListKnowledgeInput['sort']> {
    return sort === 'updated-desc' || sort === 'created-desc' || sort === 'title-asc';
}

function buildTagCounts(rows: KnowledgeRow[]): Array<{ tag: string; count: number }> {
    const counts = new Map<string, number>();

    for (const row of rows) {
        for (const tag of parseTags(row.tags)) {
            counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
    }

    return Array.from(counts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
}

function buildRecencyCounts(rows: KnowledgeRow[]): Array<{ bucket: string; count: number }> {
    const counts = new Map<RecencyBucket, number>(
        RECENCY_BUCKETS.map(bucket => [bucket, 0])
    );
    const now = Date.now();

    for (const row of rows) {
        const bucket = getRecencyBucket(row.updated_at, now);
        counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }

    return RECENCY_BUCKETS.map(bucket => ({
        bucket,
        count: counts.get(bucket) ?? 0,
    }));
}

function getRecencyBucket(updatedAt: string, now: number): RecencyBucket {
    const timestamp = Date.parse(updatedAt);
    if (Number.isNaN(timestamp)) {
        return 'older';
    }

    const ageMs = now - timestamp;
    const dayMs = 24 * 60 * 60 * 1000;

    if (ageMs <= dayMs) {
        return 'today';
    }

    if (ageMs <= 7 * dayMs) {
        return 'week';
    }

    if (ageMs <= 30 * dayMs) {
        return 'month';
    }

    return 'older';
}
