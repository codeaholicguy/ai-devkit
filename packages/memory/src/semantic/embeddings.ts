import type { SearchResultItem, SearchRetrievalExplanation } from '../domain/knowledge/types.js';

export const EMBEDDING_DIMENSION = 384;
export const RRF_K = 10;
const SEMANTIC_ONLY_MIN_SIMILARITY = 0.5;

interface EmbeddingDocument {
    title: string;
    content: string;
    tags: string[];
}

export interface SemanticCandidate extends Omit<SearchResultItem, 'score' | 'retrieval'> {
    similarity: number;
}

export function buildEmbeddingText(document: EmbeddingDocument): string {
    const tags = [...document.tags]
        .map(tag => tag.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    const sections = [document.title.trim(), document.content.trim()];
    if (tags.length > 0) {
        sections.push(`Tags: ${tags.join(', ')}`);
    }
    return sections.join('\n\n');
}

export function serializeEmbedding(vector: Float32Array): Buffer {
    if (vector.length !== EMBEDDING_DIMENSION) {
        throw new Error(`Embedding must contain ${EMBEDDING_DIMENSION} dimensions`);
    }
    return Buffer.from(vector.buffer.slice(vector.byteOffset, vector.byteOffset + vector.byteLength));
}

export function deserializeEmbedding(value: Buffer): Float32Array {
    const expectedBytes = EMBEDDING_DIMENSION * Float32Array.BYTES_PER_ELEMENT;
    if (value.byteLength !== expectedBytes) {
        throw new Error(`Embedding BLOB must contain ${expectedBytes} bytes`);
    }
    const copy = Uint8Array.from(value);
    return new Float32Array(copy.buffer);
}

export function cosineSimilarity(left: Float32Array, right: Float32Array): number {
    if (left.length !== right.length) {
        throw new Error('Embedding dimensions must match');
    }
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index++) {
        dot += left[index]! * right[index]!;
        leftNorm += left[index]! ** 2;
        rightNorm += right[index]! ** 2;
    }
    if (leftNorm === 0 || rightNorm === 0) {
        return 0;
    }
    return dot / Math.sqrt(leftNorm * rightNorm);
}

export function fuseSearchResults(
    lexical: SearchResultItem[],
    semantic: SemanticCandidate[],
    limit: number,
    explain = false,
): SearchResultItem[] {
    const fused = new Map<string, {
        item: SearchResultItem;
        score: number;
        lexicalRank: number | null;
        semanticRank: number | null;
        similarity: number | null;
    }>();

    lexical.forEach((item, index) => {
        fused.set(item.id, {
            item,
            score: 1 / (RRF_K + index + 1),
            lexicalRank: index + 1,
            semanticRank: null,
            similarity: null,
        });
    });

    semantic.forEach((candidate, index) => {
        const existing = fused.get(candidate.id);
        const semanticScore = 1 / (RRF_K + index + 1);
        if (existing) {
            existing.score += semanticScore;
            existing.semanticRank = index + 1;
            existing.similarity = candidate.similarity;
            return;
        }
        if (candidate.similarity < SEMANTIC_ONLY_MIN_SIMILARITY) return;
        const { similarity, ...item } = candidate;
        fused.set(candidate.id, {
            item: { ...item, score: 0 },
            score: semanticScore,
            lexicalRank: null,
            semanticRank: index + 1,
            similarity,
        });
    });

    return [...fused.values()]
        .sort((left, right) =>
            right.score - left.score
            || Number(right.lexicalRank !== null) - Number(left.lexicalRank !== null)
            || (left.lexicalRank ?? Number.POSITIVE_INFINITY) - (right.lexicalRank ?? Number.POSITIVE_INFINITY)
            || (left.semanticRank ?? Number.POSITIVE_INFINITY) - (right.semanticRank ?? Number.POSITIVE_INFINITY)
            || left.item.id.localeCompare(right.item.id)
        )
        .slice(0, limit)
        .map(entry => {
            const retrieval: SearchRetrievalExplanation | undefined = explain ? {
                lexicalRank: entry.lexicalRank,
                semanticRank: entry.semanticRank,
                semanticSimilarity: entry.similarity,
                rrfScore: entry.score,
            } : undefined;
            return {
                ...entry.item,
                score: Math.round(entry.score * 1_000_000) / 1_000_000,
                ...(retrieval ? { retrieval } : {}),
            };
        });
}
