import * as fs from 'node:fs';
import type {
    ConversationMessage,
    ConversationResetReason,
    ConversationTailResult,
} from '../adapters/AgentAdapter.js';

export interface JsonlConversationReducer<State> {
    createState(): State;
    processRecord(state: State, record: unknown): void;
    getMessages(state: State): ConversationMessage[];
    trim?(state: State, limit: number): void;
}

export interface JsonlConversationReadOptions<State> {
    key: string;
    filePath: string;
    limit: number;
    reducer: JsonlConversationReducer<State>;
}

interface FileIdentity {
    dev: number;
    ino: number;
}

interface CacheEntry<State = unknown> {
    identity: FileIdentity;
    size: number;
    mtimeMs: number;
    offset: number;
    incomplete: Buffer;
    state: State;
}

export interface JsonlConversationTailCacheOptions {
    maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 50;

export class JsonlConversationTailCache {
    private readonly maxEntries: number;
    private readonly entries = new Map<string, CacheEntry>();
    private readonly pending = new Map<string, Promise<unknown>>();

    constructor(options: JsonlConversationTailCacheOptions = {}) {
        this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
    }

    async read<State>(options: JsonlConversationReadOptions<State>): Promise<ConversationTailResult> {
        const cacheKey = this.cacheKey(options);
        const previous = this.pending.get(cacheKey) ?? Promise.resolve();
        const current = previous.catch(() => undefined).then(() => this.readUnlocked(cacheKey, options));
        this.pending.set(cacheKey, current);

        try {
            return await current;
        } finally {
            if (this.pending.get(cacheKey) === current) this.pending.delete(cacheKey);
        }
    }

    clear(): void {
        this.entries.clear();
    }

    private async readUnlocked<State>(
        cacheKey: string,
        options: JsonlConversationReadOptions<State>,
    ): Promise<ConversationTailResult> {
        let stat: fs.Stats;
        try {
            stat = await fs.promises.stat(options.filePath);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== 'ENOENT') throw error;
            this.entries.delete(cacheKey);
            return {
                messages: [],
                stats: {
                    bytesRead: 0,
                    recordsProcessed: 0,
                    parseErrors: 0,
                    cacheHit: false,
                    resetReason: 'missing',
                },
            };
        }

        const identity = { dev: stat.dev, ino: stat.ino };
        let entry = this.entries.get(cacheKey) as CacheEntry<State> | undefined;
        let resetReason: ConversationResetReason = null;

        if (!entry) {
            resetReason = 'initial';
        } else if (entry.identity.dev !== identity.dev || entry.identity.ino !== identity.ino) {
            resetReason = 'identity-changed';
        } else if (stat.size < entry.offset) {
            resetReason = 'truncated';
        } else if (stat.size === entry.offset && stat.mtimeMs !== entry.mtimeMs) {
            // The path changed without growing. This covers truncate-and-rewrite
            // cycles that finish at the previous size while retaining the inode.
            resetReason = 'truncated';
        }

        if (resetReason !== null) {
            entry = {
                identity,
                size: 0,
                mtimeMs: 0,
                offset: 0,
                incomplete: Buffer.alloc(0),
                state: options.reducer.createState(),
            };
        }

        if (
            resetReason === null &&
            entry &&
            stat.size === entry.size &&
            stat.mtimeMs === entry.mtimeMs
        ) {
            this.touch(cacheKey, entry);
            return {
                messages: this.tail(options.reducer.getMessages(entry.state), options.limit),
                stats: {
                    bytesRead: 0,
                    recordsProcessed: 0,
                    parseErrors: 0,
                    cacheHit: true,
                    resetReason: null,
                },
            };
        }

        const start = entry!.offset;
        const bytesToRead = Math.max(0, stat.size - start);
        let appended = Buffer.alloc(0);
        if (bytesToRead > 0) {
            const handle = await fs.promises.open(options.filePath, 'r');
            try {
                appended = Buffer.allocUnsafe(bytesToRead);
                const { bytesRead } = await handle.read(appended, 0, bytesToRead, start);
                appended = appended.subarray(0, bytesRead);
            } finally {
                await handle.close();
            }
        }

        const input = entry!.incomplete.length > 0
            ? Buffer.concat([entry!.incomplete, appended])
            : appended;
        let recordStart = 0;
        let recordsProcessed = 0;
        let parseErrors = 0;

        for (let index = 0; index < input.length; index++) {
            if (input[index] !== 0x0a) continue;
            const raw = input.subarray(recordStart, index).toString('utf8').trim();
            recordStart = index + 1;
            if (!raw) continue;

            recordsProcessed++;
            try {
                options.reducer.processRecord(entry!.state, JSON.parse(raw));
                options.reducer.trim?.(entry!.state, options.limit);
            } catch (error) {
                if (error instanceof SyntaxError) {
                    parseErrors++;
                } else {
                    throw error;
                }
            }
        }

        entry!.identity = identity;
        entry!.size = stat.size;
        entry!.mtimeMs = stat.mtimeMs;
        entry!.offset = start + appended.length;
        entry!.incomplete = Buffer.from(input.subarray(recordStart));
        this.touch(cacheKey, entry!);

        return {
            messages: this.tail(options.reducer.getMessages(entry!.state), options.limit),
            stats: {
                bytesRead: appended.length,
                recordsProcessed,
                parseErrors,
                cacheHit: false,
                resetReason,
            },
        };
    }

    private cacheKey<State>(options: JsonlConversationReadOptions<State>): string {
        return `${options.key}\0${options.filePath}\0${options.limit}`;
    }

    private touch(key: string, entry: CacheEntry): void {
        this.entries.delete(key);
        this.entries.set(key, entry);
        while (this.entries.size > this.maxEntries) {
            this.entries.delete(this.entries.keys().next().value!);
        }
    }

    private tail(messages: ConversationMessage[], limit: number): ConversationMessage[] {
        return limit > 0 && messages.length > limit ? messages.slice(-limit) : [...messages];
    }
}
