import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { initializeSchema } from './schema.js';

/**
 * Default database path: ~/.ai-devkit/tasks.db
 */
export const DEFAULT_DB_PATH = join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.ai-devkit',
    'tasks.db'
);

export interface DatabaseOptions {
    dbPath?: string;
    readonly?: boolean;
}

/**
 * Resolve the database file path.
 *
 * Precedence:
 *   1. explicit `dbPath` argument
 *   2. AIDEVKIT_TASKS_DB env var
 *   3. ~/.ai-devkit/tasks.db
 */
export function resolveDbPath(dbPath?: string): string {
    if (dbPath && dbPath.trim()) {
        return dbPath.trim();
    }
    const env = process.env.AIDEVKIT_TASKS_DB;
    if (env && env.trim()) {
        return env.trim();
    }
    return DEFAULT_DB_PATH;
}

/**
 * SQLite connection. Configures WAL + busy_timeout for safe concurrent local
 * access (mirrors the @ai-devkit/memory package) and runs migrations on open.
 */
export class DatabaseConnection {
    private readonly db: Database.Database;
    readonly dbPath: string;

    constructor(options: DatabaseOptions = {}) {
        this.dbPath = options.dbPath ?? resolveDbPath();
        mkdirSync(dirname(this.dbPath), { recursive: true });
        this.db = new Database(this.dbPath, {
            readonly: options.readonly ?? false,
        });
        this.configure();
        initializeSchema(this);
    }

    private configure(): void {
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('busy_timeout = 5000');
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

    /** Execute raw SQL (e.g. a migration script) without parameters. */
    exec(sql: string): void {
        this.db.exec(sql);
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
