import { getDatabase } from '../database/index.js';
import type { KnowledgeRow, KnowledgeSummaryResult } from '../types/index.js';

type RecencyBucket = 'today' | 'week' | 'month' | 'older';

const RECENCY_BUCKETS: RecencyBucket[] = ['today', 'week', 'month', 'older'];

export function getKnowledgeSummary(): KnowledgeSummaryResult {
    const db = getDatabase();
    const totalRow = db.queryOne<{ total: number }>('SELECT COUNT(*) as total FROM knowledge');
    const scopes = db.query<{ scope: string; count: number }>(
        `SELECT scope, COUNT(*) as count
         FROM knowledge
         GROUP BY scope
         ORDER BY scope ASC`
    );
    const rows = db.query<KnowledgeRow>(
        `SELECT id, title, content, tags, scope, normalized_title, content_hash, created_at, updated_at
         FROM knowledge`
    );

    return {
        totalItems: totalRow?.total ?? 0,
        scopes,
        tags: buildTagCounts(rows),
        recency: buildRecencyCounts(rows),
    };
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
