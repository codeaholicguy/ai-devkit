import { getDatabase } from '../database/index.js';
import { normalizeTags } from '../services/normalizer.js';
import { getDefaultLocalEmbedder, type LocalEmbedder } from '../services/embedder.js';
import { ensureModelFiles, getModelDirectory, inspectModelFiles, MODEL_VERSION } from '../services/model.js';
import { buildEmbeddingText, serializeEmbedding } from '../services/semantic.js';
import { storeKnowledge } from './store.js';
import { updateKnowledge } from './update.js';
import type { KnowledgeRow, StoreKnowledgeInput, StoreKnowledgeResult, UpdateKnowledgeInput, UpdateKnowledgeResult } from '../types/index.js';

interface EmbedderOption {
    embedder?: LocalEmbedder;
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

export async function getSemanticStatus(options: { modelsRoot?: string } = {}): Promise<SemanticStatusResult> {
    const db = getDatabase();
    const directory = getModelDirectory(options.modelsRoot);
    const model = await inspectModelFiles(directory);
    const counts = db.queryOne<{ total: number; current: number; missing: number; stale: number }>(`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN embedding IS NOT NULL AND embedding_version = ? THEN 1 ELSE 0 END), 0) AS current,
          COALESCE(SUM(CASE WHEN embedding IS NULL THEN 1 ELSE 0 END), 0) AS missing,
          COALESCE(SUM(CASE WHEN embedding IS NOT NULL AND (embedding_version IS NULL OR embedding_version != ?) THEN 1 ELSE 0 END), 0) AS stale
        FROM knowledge
    `, [MODEL_VERSION, MODEL_VERSION]) ?? { total: 0, current: 0, missing: 0, stale: 0 };
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
    const existing = getDatabase().queryOne<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', [input.id]);
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

interface ReembedOptions extends EmbedderOption {
    force?: boolean;
    batchSize?: number;
}

export async function reembedKnowledge(options: ReembedOptions = {}): Promise<ReembedResult> {
    const db = getDatabase();
    const all = db.query<KnowledgeRow>('SELECT * FROM knowledge ORDER BY id');
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
                    db.execute(
                        'UPDATE knowledge SET embedding = ?, embedding_version = ? WHERE id = ?',
                        [serializeEmbedding(vectors[index]!), MODEL_VERSION, row.id],
                    );
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
