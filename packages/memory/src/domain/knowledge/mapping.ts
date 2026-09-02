import type { KnowledgeItem, KnowledgeRow } from './types.js';

export function mapKnowledgeRow(row: KnowledgeRow): KnowledgeItem {
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

export function parseTags(rawTags: string): string[] {
    try {
        const tags = JSON.parse(rawTags) as unknown;
        return Array.isArray(tags)
            ? tags.filter((tag): tag is string => typeof tag === 'string')
            : [];
    } catch {
        return [];
    }
}
