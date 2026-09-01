import { getDatabase } from '../database/index.js';
import { getDefaultLocalEmbedder, type LocalEmbedder } from '../services/embedder.js';
import { MODEL_DIMENSION, MODEL_VERSION } from '../services/model.js';
import { cosineSimilarity, deserializeEmbedding, fuseSearchResults, type SemanticCandidate } from '../services/semantic.js';
import { searchKnowledge } from './search.js';
import type { SearchKnowledgeInput, SearchKnowledgeResult } from '../types/index.js';

const MAX_SEMANTIC_CORPUS = 5_000;
const MAX_CANDIDATES = 20;

interface RawSemanticRow {
    id: string;
    title: string;
    content: string;
    tags: string;
    scope: string;
    embedding: Buffer;
}

interface HybridSearchOptions {
    embedder?: LocalEmbedder;
}

function semanticStatus(
    status: 'ready' | 'unavailable' | 'corpus-too-large',
    eligibleCount: number,
    reason?: string,
) {
    return {
        status,
        embeddingVersion: MODEL_VERSION,
        eligibleCount,
        ...(reason ? { reason } : {}),
    } as const;
}

export async function searchKnowledgeHybrid(
    input: SearchKnowledgeInput,
    options: HybridSearchOptions = {},
): Promise<SearchKnowledgeResult> {
    const requestedLimit = Math.min(Math.max(input.limit ?? 5, 1), MAX_CANDIDATES);
    const lexical = searchKnowledge({ ...input, limit: MAX_CANDIDATES, explain: false });
    const db = getDatabase();
    const scopeClause = input.scope ? ` AND (scope = ? OR scope = 'global')` : '';
    const scopeParams = input.scope ? [input.scope] : [];
    const count = db.queryOne<{ count: number }>(
        `SELECT COUNT(*) AS count FROM knowledge WHERE embedding_version = ? AND embedding IS NOT NULL${scopeClause}`,
        [MODEL_VERSION, ...scopeParams],
    )?.count ?? 0;

    if (count > MAX_SEMANTIC_CORPUS) {
        return {
            ...lexical,
            results: lexical.results.slice(0, requestedLimit),
            retrievalMode: 'lexical',
            semantic: semanticStatus('corpus-too-large', count, `Semantic scan is limited to ${MAX_SEMANTIC_CORPUS} rows`),
        };
    }

    try {
        const embedder = options.embedder ?? await getDefaultLocalEmbedder();
        const queryEmbedding = await embedder.embed(input.query.trim());
        if (queryEmbedding.length !== MODEL_DIMENSION) {
            throw new Error(`Semantic model returned ${queryEmbedding.length} dimensions; expected ${MODEL_DIMENSION}`);
        }
        const rows = db.query<RawSemanticRow>(
            `SELECT id, title, content, tags, scope, embedding
             FROM knowledge
             WHERE embedding_version = ? AND embedding IS NOT NULL${scopeClause}`,
            [MODEL_VERSION, ...scopeParams],
        );
        const candidates: SemanticCandidate[] = [];
        for (const row of rows) {
            try {
                const embedding = deserializeEmbedding(row.embedding);
                let tags: string[] = [];
                try { tags = JSON.parse(row.tags) as string[]; } catch { /* malformed legacy tags rank without tags */ }
                candidates.push({
                    id: row.id,
                    title: row.title,
                    content: row.content,
                    tags,
                    scope: row.scope,
                    similarity: cosineSimilarity(queryEmbedding, embedding),
                });
            } catch {
                // Corrupt or dimension-mismatched rows remain available through lexical search.
            }
        }
        candidates.sort((left, right) =>
            right.similarity - left.similarity || left.id.localeCompare(right.id)
        );
        return {
            ...lexical,
            results: fuseSearchResults(lexical.results, candidates.slice(0, MAX_CANDIDATES), requestedLimit, input.explain),
            totalMatches: new Set([...lexical.results.map(item => item.id), ...candidates.map(item => item.id)]).size,
            retrievalMode: 'hybrid',
            semantic: semanticStatus('ready', candidates.length),
        };
    } catch (error) {
        return {
            ...lexical,
            results: lexical.results.slice(0, requestedLimit),
            retrievalMode: 'lexical',
            semantic: semanticStatus('unavailable', count, error instanceof Error ? error.message : String(error)),
        };
    }
}
