import { getDatabase } from '../database/index.js';
import { normalizeTags } from '../domain/knowledge/normalize.js';
import { getDefaultLocalEmbedder, type LocalEmbedder } from '../semantic/embedder.js';
import { buildEmbeddingText, cosineSimilarity, deserializeEmbedding, fuseSearchResults, serializeEmbedding, type SemanticCandidate } from '../semantic/embeddings.js';
import { ensureModelFiles, getModelDirectory, inspectModelFiles, MODEL_DIMENSION, MODEL_VERSION } from '../semantic/model.js';
import { findKnowledgeById } from '../repositories/knowledge.repository.js';
import {
    countEligibleSemanticRows,
    getEligibleSemanticRows,
    getRowsForEmbeddingBackfill,
    getSemanticEmbeddingCounts,
    updateKnowledgeEmbedding,
} from '../repositories/semantic.repository.js';
import { storeKnowledge, updateKnowledge } from './knowledge.service.js';
import { searchKnowledge } from './search.service.js';
import type { SearchKnowledgeInput, SearchKnowledgeResult, StoreKnowledgeInput, StoreKnowledgeResult, UpdateKnowledgeInput, UpdateKnowledgeResult } from '../domain/knowledge/types.js';

const MAX_SEMANTIC_CORPUS = 5_000;
const MAX_CANDIDATES = 20;

interface HybridSearchOptions {
    embedder?: LocalEmbedder;
}

interface EmbedderOption {
    embedder?: LocalEmbedder;
}

interface ReembedOptions extends EmbedderOption {
    force?: boolean;
    batchSize?: number;
}

export interface SemanticStatusResult {
    modelReady: boolean;
    modelDirectory: string;
    embeddingVersion: string;
    total: number;
    current: number;
    missing: number;
    stale: number;
}

export interface ReembedResult {
    total: number;
    embedded: number;
    skipped: number;
    failed: number;
    embeddingVersion: string;
}

export async function searchKnowledgeHybrid(
    input: SearchKnowledgeInput,
    options: HybridSearchOptions = {},
): Promise<SearchKnowledgeResult> {
    const requestedLimit = Math.min(Math.max(input.limit ?? 5, 1), MAX_CANDIDATES);
    const lexical = searchKnowledge({ ...input, limit: MAX_CANDIDATES, explain: false });
    const db = getDatabase();
    const count = countEligibleSemanticRows(db, MODEL_VERSION, input.scope);

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
        const rows = getEligibleSemanticRows(db, MODEL_VERSION, input.scope);
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

export async function getSemanticStatus(options: { modelsRoot?: string } = {}): Promise<SemanticStatusResult> {
    const db = getDatabase();
    const directory = getModelDirectory(options.modelsRoot);
    const model = await inspectModelFiles(directory);
    const counts = getSemanticEmbeddingCounts(db, MODEL_VERSION);
    return {
        modelReady: model.ready,
        modelDirectory: directory,
        embeddingVersion: MODEL_VERSION,
        total: counts.total,
        current: counts.current,
        missing: counts.missing,
        stale: counts.stale,
    };
}

export async function downloadSemanticModel(options: { modelsRoot?: string } = {}): Promise<SemanticStatusResult> {
    await ensureModelFiles({ directory: getModelDirectory(options.modelsRoot) });
    return getSemanticStatus(options);
}

export async function storeKnowledgeSemantic(
    input: StoreKnowledgeInput,
    options: EmbedderOption = {},
): Promise<StoreKnowledgeResult> {
    let value: Buffer;
    try {
        const embedder = options.embedder ?? await getDefaultLocalEmbedder();
        const tags = normalizeTags(input.tags ?? []);
        const vector = await embedder.embed(buildEmbeddingText({ title: input.title, content: input.content, tags }));
        value = serializeEmbedding(vector);
    } catch {
        return storeKnowledge(input);
    }
    return storeKnowledge(input, { value, version: MODEL_VERSION });
}

export async function updateKnowledgeSemantic(
    input: UpdateKnowledgeInput,
    options: EmbedderOption = {},
): Promise<UpdateKnowledgeResult> {
    if (input.title === undefined && input.content === undefined && input.tags === undefined) {
        return updateKnowledge(input);
    }
    const existing = findKnowledgeById(getDatabase(), input.id);
    if (!existing) return updateKnowledge(input);
    let value: Buffer;
    try {
        const embedder = options.embedder ?? await getDefaultLocalEmbedder();
        const vector = await embedder.embed(buildEmbeddingText({
            title: input.title ?? existing.title,
            content: input.content ?? existing.content,
            tags: input.tags !== undefined ? normalizeTags(input.tags) : JSON.parse(existing.tags) as string[],
        }));
        value = serializeEmbedding(vector);
    } catch {
        return updateKnowledge(input);
    }
    return updateKnowledge(input, { value, version: MODEL_VERSION });
}

export async function reembedKnowledge(options: ReembedOptions = {}): Promise<ReembedResult> {
    const db = getDatabase();
    const all = getRowsForEmbeddingBackfill(db);
    const pending = options.force
        ? all
        : all.filter(row => !row.embedding || row.embedding_version !== MODEL_VERSION);
    const embedder = options.embedder ?? await getDefaultLocalEmbedder();
    const batchSize = Math.max(1, options.batchSize ?? 32);
    let embedded = 0;
    let failed = 0;

    for (let offset = 0; offset < pending.length; offset += batchSize) {
        const batch = pending.slice(offset, offset + batchSize);
        try {
            const texts = batch.map(row => buildEmbeddingText({
                title: row.title,
                content: row.content,
                tags: JSON.parse(row.tags) as string[],
            }));
            const vectors = await embedder.embedMany(texts);
            if (vectors.length !== batch.length) throw new Error('Semantic model returned the wrong batch size');
            db.transaction(() => {
                batch.forEach((row, index) => {
                    updateKnowledgeEmbedding(db, row.id, serializeEmbedding(vectors[index]!), MODEL_VERSION);
                });
            });
            embedded += batch.length;
        } catch {
            failed += batch.length;
        }
    }

    return {
        total: all.length,
        embedded,
        skipped: all.length - pending.length,
        failed,
        embeddingVersion: MODEL_VERSION,
    };
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
