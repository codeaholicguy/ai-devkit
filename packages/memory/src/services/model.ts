import { createHash } from 'crypto';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises';

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const MODEL_REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
export const MODEL_DIMENSION = 384;
export const MODEL_VERSION = `${MODEL_ID}@${MODEL_REVISION}:q8:${MODEL_DIMENSION}`;

export interface ModelFile {
    path: string;
    sha256: string;
    size: number;
}

export const MODEL_FILES: readonly ModelFile[] = [
    { path: 'config.json', sha256: '7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7', size: 650 },
    { path: 'tokenizer.json', sha256: 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0', size: 711_661 },
    { path: 'tokenizer_config.json', sha256: '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3', size: 366 },
    { path: 'onnx/model_quantized.onnx', sha256: 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1', size: 22_972_370 },
];

export interface ModelInspection {
    ready: boolean;
    missing: string[];
    corrupt: string[];
}

export function getModelDirectory(modelsRoot = join(homedir(), '.ai-devkit', 'models')): string {
    return join(modelsRoot, MODEL_ID.replace('/', '--'), MODEL_REVISION);
}

async function digestFile(path: string): Promise<{ sha256: string; size: number } | null> {
    try {
        const bytes = await readFile(path);
        return {
            sha256: createHash('sha256').update(bytes).digest('hex'),
            size: bytes.byteLength,
        };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

export async function inspectModelFiles(
    directory: string,
    manifest: readonly ModelFile[] = MODEL_FILES,
): Promise<ModelInspection> {
    const missing: string[] = [];
    const corrupt: string[] = [];
    for (const file of manifest) {
        const digest = await digestFile(join(directory, file.path));
        if (!digest) {
            missing.push(file.path);
        } else if (digest.sha256 !== file.sha256 || digest.size !== file.size) {
            corrupt.push(file.path);
        }
    }
    return { ready: missing.length === 0 && corrupt.length === 0, missing, corrupt };
}

interface EnsureModelFilesOptions {
    directory?: string;
    manifest?: readonly ModelFile[];
    fetchImpl?: typeof fetch;
}

export async function ensureModelFiles(options: EnsureModelFilesOptions = {}): Promise<string> {
    const directory = options.directory ?? getModelDirectory();
    const manifest = options.manifest ?? MODEL_FILES;
    const fetchImpl = options.fetchImpl ?? fetch;
    const inspection = await inspectModelFiles(directory, manifest);
    const needed = new Set([...inspection.missing, ...inspection.corrupt]);

    for (const file of manifest) {
        if (!needed.has(file.path)) continue;
        const url = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/${file.path}?download=true`;
        const response = await fetchImpl(url);
        if (!response.ok) {
            throw new Error(`Failed to download semantic model file ${file.path}: HTTP ${response.status}`);
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        if (bytes.byteLength !== file.size || sha256 !== file.sha256) {
            throw new Error(`Semantic model checksum mismatch for ${file.path}`);
        }

        const destination = join(directory, file.path);
        const temporary = `${destination}.tmp-${process.pid}`;
        await mkdir(dirname(destination), { recursive: true });
        try {
            await writeFile(temporary, bytes, { mode: 0o600 });
            await rename(temporary, destination);
        } catch (error) {
            await rm(temporary, { force: true });
            throw error;
        }
    }
    return directory;
}

export function normalizeEmbedding(vector: Float32Array): Float32Array {
    let squaredNorm = 0;
    for (const value of vector) squaredNorm += value * value;
    const norm = Math.sqrt(squaredNorm);
    if (!Number.isFinite(norm) || norm === 0) {
        throw new Error('Semantic model returned a zero or invalid embedding');
    }
    const normalized = new Float32Array(vector.length);
    for (let index = 0; index < vector.length; index++) {
        normalized[index] = vector[index]! / norm;
    }
    return normalized;
}
