import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { initializeSchema } from './schema.js';

const CONFIGURE_RETRY_DELAY_MS = 50;

function waitBeforeConfigureRetry(): void {
    // Node has no synchronous sleep; this blocks until the timeout expires.
    const waitBuffer = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    Atomics.wait(waitBuffer, 0, 0, CONFIGURE_RETRY_DELAY_MS);
}

function isSqliteBusy(error: unknown): error is { code: string } {
    return typeof error === 'object' && error !== null && 'code' in error
        && (error as { code?: unknown }).code === 'SQLITE_BUSY';
}

/**
 * Default database path: ~/.ai-devkit/memory.db
 */
export const DEFAULT_DB_PATH = join(homedir(), '.ai-devkit', 'memory.db');

export interface DatabaseOptions {
    dbPath?: string;
    verbose?: boolean;
    readonly?: boolean;
}

export class DatabaseConnection {
    private db: Database.Database;
    private readonly dbPath: string;

    constructor(options: DatabaseOptions = {}) {
        this.dbPath = options.dbPath ?? DEFAULT_DB_PATH;

        const dir = dirname(this.dbPath);
        mkdirSync(dir, { recursive: true });

        this.db = new Database(this.dbPath, {
            readonly: options.readonly ?? false,
            timeout: 5000,
            verbose: options.verbose ? console.log : undefined,
        });

        this.configure();
    }

    private configure(): void {
        try {
            this.configureOnce();
        } catch (error) {
            if (!isSqliteBusy(error)) throw error;
            waitBeforeConfigureRetry();
            this.configureOnce();
        }
    }

    private configureOnce(): void {
        const journalMode = this.db.pragma('journal_mode', { simple: true }) as string;
        if (journalMode.toLowerCase() !== 'wal') this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('busy_timeout = 5000');
        this.db.pragma('mmap_size = 268435456');
    }

    get instance(): Database.Database {
        return this.db;
    }

    get path(): string {
        return this.dbPath;
    }

    get isOpen(): boolean {
        return this.db.open;
    }

    query<T>(sql: string, params: unknown[] = []): T[] {
        return this.db.prepare(sql).all(...params) as T[];
    }

    queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
        return this.db.prepare(sql).get(...params) as T | undefined;
    }

    execute(sql: string, params: unknown[] = []): Database.RunResult {
        return this.db.prepare(sql).run(...params);
    }
    transaction<T>(fn: () => T): T {
        return this.db.transaction(fn)();
    }

    close(): void {
        if (this.db.open) {
            this.db.close();
        }
    }
}

let instance: DatabaseConnection | null = null;
let schemaInitialized = false;

export function getDatabase(options?: DatabaseOptions): DatabaseConnection {
    if (!instance) {
        instance = new DatabaseConnection(options);
    }

    if (!schemaInitialized) {
        initializeSchema(instance);
        schemaInitialized = true;
    }

    return instance;
}

export function closeDatabase(): void {
    if (instance) {
        instance.close();
        instance = null;
        schemaInitialized = false;
    }
}
