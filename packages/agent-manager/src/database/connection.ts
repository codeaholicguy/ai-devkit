import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { initializeSchema } from './schema.js';

export const DEFAULT_AGENT_REGISTRY_DB_PATH = join(homedir(), '.ai-devkit', 'agents.db');

export interface DatabaseOptions {
    dbPath?: string;
    verbose?: boolean | ((message: string) => void);
    readonly?: boolean;
}

export function resolveAgentRegistryDbPath(filePath?: string): string {
    if (!filePath) return DEFAULT_AGENT_REGISTRY_DB_PATH;
    return filePath.endsWith('.json') ? filePath.replace(/\.json$/, '.db') : filePath;
}

export class DatabaseConnection {
    private db: Database.Database;
    private readonly dbPath: string;
    private readonly readonly: boolean;

    constructor(options: DatabaseOptions = {}) {
        this.dbPath = options.dbPath ?? DEFAULT_AGENT_REGISTRY_DB_PATH;
        this.readonly = options.readonly ?? false;
        if (this.readonly && !existsSync(this.dbPath)) {
            throw new Error(`Cannot open readonly agent database because it does not exist: ${this.dbPath}`);
        }
        if (!this.readonly) mkdirSync(dirname(this.dbPath), { recursive: true });

        this.db = new Database(this.dbPath, {
            readonly: this.readonly,
            verbose: typeof options.verbose === 'function'
                ? options.verbose
                : options.verbose ? console.log : undefined,
        });

        if (this.readonly) {
            const version = this.db.pragma('user_version', { simple: true }) as number;
            if (version < 3) {
                this.db.close();
                throw new Error(`Readonly agent database requires schema version 3 (found ${version}).`);
            }
        } else {
            this.configure();
            initializeSchema(this);
        }
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
