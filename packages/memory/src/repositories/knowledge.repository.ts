import { buildFtsQuery } from '../domain/knowledge/search-query.js';
import { normalizeScope, normalizeTags } from '../domain/knowledge/normalize.js';
import type { DatabaseConnection } from '../database/index.js';
import type { KnowledgeRow, ListKnowledgeInput, ListKnowledgeSort } from '../domain/knowledge/types.js';

export interface StoredEmbedding {
    value: Buffer;
    version: string;
}

export interface KnowledgeInsert {
    id: string;
    title: string;
    content: string;
    tags: string[];
    scope: string;
    normalizedTitle: string;
    contentHash: string;
    createdAt: string;
    updatedAt: string;
    embedding?: StoredEmbedding;
}

export interface KnowledgeUpdate {
    id: string;
    title: string;
    content: string;
    tags: string[];
    scope: string;
    normalizedTitle: string;
    contentHash: string;
    updatedAt: string;
    embedding: Buffer | null;
    embeddingVersion: string | null;
}

export interface KnowledgeListRows {
    rows: KnowledgeRow[];
    total: number;
}

interface ListQuery {
    where: string[];
    params: unknown[];
}

export function findKnowledgeById(db: DatabaseConnection, id: string): KnowledgeRow | undefined {
    return db.queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [id]);
}

export function findKnowledgeByNormalizedTitle(
    db: DatabaseConnection,
    normalizedTitle: string,
    scope: string,
    excludeId?: string,
): Pick<KnowledgeRow, 'id'> | undefined {
    const exclusion = excludeId ? ' AND id != ?' : '';
    return db.queryOne<Pick<KnowledgeRow, 'id'>>(
        `SELECT id FROM knowledge WHERE normalized_title = ? AND scope = ?${exclusion}`,
        excludeId ? [normalizedTitle, scope, excludeId] : [normalizedTitle, scope],
    );
}

export function findKnowledgeByContentHash(
    db: DatabaseConnection,
    contentHash: string,
    scope: string,
    excludeId?: string,
): Pick<KnowledgeRow, 'id'> | undefined {
    const exclusion = excludeId ? ' AND id != ?' : '';
    return db.queryOne<Pick<KnowledgeRow, 'id'>>(
        `SELECT id FROM knowledge WHERE content_hash = ? AND scope = ?${exclusion}`,
        excludeId ? [contentHash, scope, excludeId] : [contentHash, scope],
    );
}

export function insertKnowledge(db: DatabaseConnection, row: KnowledgeInsert): void {
    db.execute(
        `INSERT INTO knowledge (
          id, title, content, tags, scope,
          normalized_title, content_hash, created_at, updated_at,
          embedding, embedding_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            row.id,
            row.title,
            row.content,
            JSON.stringify(row.tags),
            row.scope,
            row.normalizedTitle,
            row.contentHash,
            row.createdAt,
            row.updatedAt,
            row.embedding?.value ?? null,
            row.embedding?.version ?? null,
        ],
    );
}

export function updateKnowledgeRow(db: DatabaseConnection, row: KnowledgeUpdate): void {
    db.execute(
        `UPDATE knowledge SET
            title = ?, content = ?, tags = ?, scope = ?,
            normalized_title = ?, content_hash = ?, updated_at = ?,
            embedding = ?, embedding_version = ?
        WHERE id = ?`,
        [
            row.title,
            row.content,
            JSON.stringify(row.tags),
            row.scope,
            row.normalizedTitle,
            row.contentHash,
            row.updatedAt,
            row.embedding,
            row.embeddingVersion,
            row.id,
        ],
    );
}

export function listKnowledgeRows(db: DatabaseConnection, input: ListKnowledgeInput): KnowledgeListRows {
    const limit = clampLimit(input.limit);
    const offset = clampOffset(input.offset);
    const query = buildListQuery(input);
    const orderBy = getOrderBy(input.sort);
    const whereSql = query.where.length > 0 ? `WHERE ${query.where.join(' AND ')}` : '';

    const totalRow = db.queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM knowledge k ${whereSql}`,
        query.params,
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
        [...query.params, limit, offset],
    );

    return {
        rows,
        total: totalRow?.total ?? 0,
    };
}

export function countKnowledgeRows(db: DatabaseConnection): number {
    return db.queryOne<{ total: number }>('SELECT COUNT(*) as total FROM knowledge')?.total ?? 0;
}

export function getKnowledgeScopeCounts(db: DatabaseConnection): Array<{ scope: string; count: number }> {
    return db.query<{ scope: string; count: number }>(
        `SELECT scope, COUNT(*) as count
         FROM knowledge
         GROUP BY scope
         ORDER BY scope ASC`,
    );
}

export function getAllKnowledgeRows(db: DatabaseConnection): KnowledgeRow[] {
    return db.query<KnowledgeRow>(
        `SELECT id, title, content, tags, scope, normalized_title, content_hash, created_at, updated_at
         FROM knowledge`,
    );
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

function clampLimit(limit: number | undefined): number {
    return Math.min(Math.max(limit ?? 50, 1), 200);
}

function clampOffset(offset: number | undefined): number {
    return Math.min(Math.max(offset ?? 0, 0), 100_000);
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
