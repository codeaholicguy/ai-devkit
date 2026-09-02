import {
    buildEmbeddingText,
    cosineSimilarity,
    fuseSearchResults,
    serializeEmbedding,
    deserializeEmbedding,
} from '../../../src/semantic/embeddings';

describe('semantic retrieval primitives', () => {
    it('builds deterministic document text with sorted tags', () => {
        expect(buildEmbeddingText({
            title: '  Response DTOs  ',
            content: '  Do not expose entities.  ',
            tags: ['zod', 'api'],
        })).toBe('Response DTOs\n\nDo not expose entities.\n\nTags: api, zod');
    });

    it('round-trips float32 embeddings and rejects the wrong dimension', () => {
        const vector = Float32Array.from({ length: 384 }, (_, index) => index / 384);
        expect([...deserializeEmbedding(serializeEmbedding(vector))]).toEqual([...vector]);
        expect(() => serializeEmbedding(new Float32Array(3))).toThrow('384');
    });

    it('calculates cosine similarity for normalized vectors', () => {
        expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0]))).toBe(1);
        expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBe(0);
    });

    it('uses deterministic RRF and protects lexical results on ties', () => {
        const lexical = [
            { id: 'exact', title: 'Exact', content: 'x', tags: [], scope: 'global', score: 10 },
            { id: 'shared', title: 'Shared', content: 'x', tags: [], scope: 'global', score: 9 },
        ];
        const semantic = [
            { id: 'semantic', title: 'Semantic', content: 'x', tags: [], scope: 'global', similarity: 0.9 },
            { id: 'shared', title: 'Shared', content: 'x', tags: [], scope: 'global', similarity: 0.8 },
        ];

        const first = fuseSearchResults(lexical, semantic, 5, true);
        const second = fuseSearchResults(lexical, semantic, 5, true);

        expect(first.map(item => item.id)).toEqual(['shared', 'exact', 'semantic']);
        expect(first).toEqual(second);
        expect(first[1]?.retrieval).toMatchObject({ lexicalRank: 1, semanticRank: null });
    });

    it('keeps lexical candidates above semantic-only candidates during fusion', () => {
        const item = (id: string) => ({ id, title: id, content: 'x', tags: [], scope: 'global', score: 1 });
        const lexical = Array.from({ length: 20 }, (_, index) => item(`lexical-${index}`));
        const semantic = [{ ...item('semantic-only'), similarity: 0.9 }];

        expect(fuseSearchResults(lexical, semantic, 21).at(-1)?.id).toBe('semantic-only');
    });
});
