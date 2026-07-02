import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { initializeSchema } from './schema.js';

/**
 * Default database path: ~/.ai-devkit/tasks.db
 */
export const DEFAULT_DB_PATH = join(homedir(), '.ai-devkit', 'tasks.db');

export interface DatabaseOptions {
    dbPath?: string;
    verbose?: boolean;
    readonly?: boolean;
}

/**
 * Resolve the database file path for the CLI/service.
 *
 * Precedence: explicit `dbPath` arg > default. Project-aware callers should
 * resolve configured paths before constructing the service/repository.
 */
export function resolveDbPath(dbPath?: string): string {
    if (dbPath && dbPath.trim()) {
        return dbPath.trim();
    }
    return DEFAULT_DB_PATH;
}

/**
 * SQLite connection. Configures WAL + busy_timeout + synchronous=NORMAL for safe
 * concurrent local access (mirrors @ai-devkit/memory). Schema migrations run via
 * the `getDatabase` singleton, not here.
 */
export class DatabaseConnection {
    private db: Database.Database;
    private readonly dbPath: string;

    constructor(options: DatabaseOptions = {}) {
        this.dbPath = options.dbPath ?? DEFAULT_DB_PATH;

        const dir = dirname(this.dbPath);
        mkdirSync(dir, { recursive: true });

        this.db = new Database(this.dbPath, {
            readonly: options.readonly ?? false,
            verbose: options.verbose ? console.log : undefined,
        });

        this.configure();
    }

    private configure(): void {
        this.db.pragma('journal_mode = WAL');
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

// Process-wide singleton connection (mirrors @ai-devkit/memory). The repository
// obtains the shared connection via getDatabase(); tests reset it with
// closeDatabase() to switch database files between cases.
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
