import { createHash } from 'crypto';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import {
    MODEL_DIMENSION,
    MODEL_ID,
    MODEL_REVISION,
    MODEL_VERSION,
    ensureModelFiles,
    inspectModelFiles,
    normalizeEmbedding,
} from '../../../src/semantic/model';
import { meanPoolAndNormalize } from '../../../src/semantic/embedder';

describe('semantic model files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-model-'));
    const bytes = Buffer.from('pinned model fixture');
    const manifest = [{
        path: 'nested/model.onnx',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        size: bytes.length,
    }];

    afterAll(() => rmSync(directory, { recursive: true, force: true }));

    it('pins model identity, revision, quantization, and dimension', () => {
        expect(MODEL_ID).toBe('Xenova/all-MiniLM-L6-v2');
        expect(MODEL_REVISION).toMatch(/^[a-f0-9]{40}$/);
        expect(MODEL_DIMENSION).toBe(384);
        expect(MODEL_VERSION).toContain(':q8:384');
    });

    it('downloads checked files atomically and recognizes the cache', async () => {
        const fetchImpl = vi.fn(async () => new Response(bytes));

        expect(await inspectModelFiles(directory, manifest)).toEqual({ ready: false, missing: ['nested/model.onnx'], corrupt: [] });
        await ensureModelFiles({ directory, manifest, fetchImpl });

        expect(fetchImpl).toHaveBeenCalledOnce();
        expect(readFileSync(join(directory, 'nested/model.onnx'))).toEqual(bytes);
        expect(await inspectModelFiles(directory, manifest)).toEqual({ ready: true, missing: [], corrupt: [] });
    });

    it('rejects a download that does not match the pinned checksum', async () => {
        await expect(ensureModelFiles({
            directory: join(directory, 'bad'),
            manifest,
            fetchImpl: async () => new Response('wrong'),
        })).rejects.toThrow('checksum');
    });

    it('normalizes embeddings and rejects invalid output', () => {
        expect([...normalizeEmbedding(new Float32Array([3, 4]))]).toEqual([0.6000000238418579, 0.800000011920929]);
        expect(() => normalizeEmbedding(new Float32Array([0, 0]))).toThrow('zero');
    });

    it('mean-pools only unmasked token vectors', () => {
        const pooled = meanPoolAndNormalize(
            new Float32Array([1, 0, 0, 1, 10, 10]),
            [1, 3, 2],
            [1, 1, 0],
        );
        expect(pooled[0]).toBeCloseTo(Math.SQRT1_2);
        expect(pooled[1]).toBeCloseTo(Math.SQRT1_2);
    });
});
