import { readFile } from 'fs/promises';
import { join } from 'path';
import { ensureModelFiles, getModelDirectory, inspectModelFiles, normalizeEmbedding } from './model.js';

export class SemanticModelUnavailableError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'SemanticModelUnavailableError';
    }
}

export function meanPoolAndNormalize(
    data: Float32Array,
    dimensions: readonly number[],
    attentionMask: readonly number[],
): Float32Array {
    const [, tokens, width] = dimensions;
    if (!tokens || !width || dimensions.length !== 3 || data.length !== tokens * width) {
        throw new Error('Semantic model returned an unexpected tensor shape');
    }
    const pooled = new Float32Array(width);
    let included = 0;
    for (let token = 0; token < tokens; token++) {
        if (!attentionMask[token]) continue;
        included++;
        for (let index = 0; index < width; index++) {
            pooled[index] = pooled[index]! + data[token * width + index]!;
        }
    }
    if (included === 0) {
        throw new Error('Semantic tokenizer returned no input tokens');
    }
    for (let index = 0; index < pooled.length; index++) {
        pooled[index] = pooled[index]! / included;
    }
    return normalizeEmbedding(pooled);
}

export interface LocalEmbedder {
    embed(text: string): Promise<Float32Array>;
    embedMany(texts: string[]): Promise<Float32Array[]>;
    dispose(): Promise<void>;
}

interface LoadEmbedderOptions {
    modelsRoot?: string;
    download?: boolean;
}

let defaultEmbedder: Promise<LocalEmbedder> | undefined;

/** Reuse the model session across semantic operations in long-lived CLI/MCP processes. */
export function getDefaultLocalEmbedder(): Promise<LocalEmbedder> {
    defaultEmbedder ??= loadLocalEmbedder({ download: true }).catch(error => {
        defaultEmbedder = undefined;
        throw error;
    });
    return defaultEmbedder;
}

export async function loadLocalEmbedder(options: LoadEmbedderOptions = {}): Promise<LocalEmbedder> {
    const directory = getModelDirectory(options.modelsRoot);
    if (options.download) {
        try {
            await ensureModelFiles({ directory });
        } catch (error) {
            throw new SemanticModelUnavailableError('Semantic model download failed', { cause: error });
        }
    } else {
        const inspection = await inspectModelFiles(directory);
        if (!inspection.ready) {
            throw new SemanticModelUnavailableError('Semantic model is not available in the local cache');
        }
    }

    const [{ Tokenizer }, ort, tokenizerJson, tokenizerConfig, modelBytes] = await Promise.all([
        import('@huggingface/tokenizers'),
        import('onnxruntime-web'),
        readFile(join(directory, 'tokenizer.json'), 'utf8').then(value => JSON.parse(value) as object),
        readFile(join(directory, 'tokenizer_config.json'), 'utf8').then(value => JSON.parse(value) as object),
        readFile(join(directory, 'onnx/model_quantized.onnx')),
    ]);
    ort.env.wasm.numThreads = 1;
    const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
    const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ['wasm'] });

    const embed = async (text: string): Promise<Float32Array> => {
        const encoded = tokenizer.encode(text);
        const inputIds = BigInt64Array.from(encoded.ids, BigInt);
        const attentionMask = BigInt64Array.from(encoded.attention_mask, BigInt);
        const tokenTypeIds = new BigInt64Array(inputIds.length);
        const outputs = await session.run({
            input_ids: new ort.Tensor('int64', inputIds, [1, inputIds.length]),
            attention_mask: new ort.Tensor('int64', attentionMask, [1, attentionMask.length]),
            token_type_ids: new ort.Tensor('int64', tokenTypeIds, [1, tokenTypeIds.length]),
        });
        const hidden = outputs.last_hidden_state;
        if (!hidden || !(hidden.data instanceof Float32Array)) {
            throw new Error('Semantic model did not return last_hidden_state');
        }
        return meanPoolAndNormalize(hidden.data, hidden.dims, encoded.attention_mask);
    };

    return {
        embed,
        embedMany: async texts => {
            const results: Float32Array[] = [];
            for (const text of texts) results.push(await embed(text));
            return results;
        },
        dispose: async () => session.release(),
    };
}
