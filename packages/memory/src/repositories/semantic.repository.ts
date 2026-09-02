import type { DatabaseConnection } from '../database/index.js';
import type { KnowledgeRow } from '../domain/knowledge/types.js';

export interface RawSemanticRow {
    id: string;
    title: string;
    content: string;
    tags: string;
    scope: string;
    embedding: Buffer;
}

export interface SemanticEmbeddingCounts {
    total: number;
    current: number;
    missing: number;
    stale: number;
}

export function countEligibleSemanticRows(
    db: DatabaseConnection,
    embeddingVersion: string,
    scope?: string,
): number {
    const { clause, params } = buildSemanticScopeFilter(scope);
    return db.queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM knowledge WHERE embedding_version = ? AND embedding IS NOT NULL${clause}`,
        [embeddingVersion, ...params],
    )?.count ?? 0;
}

export function getEligibleSemanticRows(
    db: DatabaseConnection,
    embeddingVersion: string,
    scope?: string,
): RawSemanticRow[] {
    const { clause, params } = buildSemanticScopeFilter(scope);
    return db.query<RawSemanticRow>(
        `SELECT id, title, content, tags, scope, embedding
         FROM knowledge
         WHERE embedding_version = ? AND embedding IS NOT NULL${clause}`,
        [embeddingVersion, ...params],
    );
}

export function getSemanticEmbeddingCounts(
    db: DatabaseConnection,
    embeddingVersion: string,
): SemanticEmbeddingCounts {
    return db.queryOne<SemanticEmbeddingCounts>(`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN embedding IS NOT NULL AND embedding_version = ? THEN 1 ELSE 0 END), 0) AS current,
          COALESCE(SUM(CASE WHEN embedding IS NULL THEN 1 ELSE 0 END), 0) AS missing,
          COALESCE(SUM(CASE WHEN embedding IS NOT NULL AND (embedding_version IS NULL OR embedding_version != ?) THEN 1 ELSE 0 END), 0) AS stale
        FROM knowledge
    `, [embeddingVersion, embeddingVersion]) ?? { total: 0, current: 0, missing: 0, stale: 0 };
}

export function getRowsForEmbeddingBackfill(db: DatabaseConnection): KnowledgeRow[] {
    return db.query<KnowledgeRow>('SELECT * FROM knowledge ORDER BY id');
}

export function updateKnowledgeEmbedding(
    db: DatabaseConnection,
    id: string,
    embedding: Buffer,
    embeddingVersion: string,
): void {
    db.execute(
        'UPDATE knowledge SET embedding = ?, embedding_version = ? WHERE id = ?',
        [embedding, embeddingVersion, id],
    );
}

function buildSemanticScopeFilter(scope?: string): { clause: string; params: string[] } {
    if (!scope) {
        return { clause: '', params: [] };
    }
    return {
        clause: ` AND (scope = ? OR scope = 'global')`,
        params: [scope],
    };
}
