import os from 'os';
import path from 'path';
import type { AgentType } from '../adapters/AgentAdapter.js';
import {
    DatabaseConnection,
    resolveAgentRegistryDbPath,
} from '../database/index.js';

export class RenameNotFoundError extends Error {
    constructor(public agentName: string) {
        super(`Agent "${agentName}" not found in registry.`);
        this.name = 'RenameNotFoundError';
    }
}

export class RenameConflictError extends Error {
    constructor(public agentName: string) {
        super(`Agent "${agentName}" is already in use.`);
        this.name = 'RenameConflictError';
    }
}

export interface RegistryEntry {
    name: string;
    type: AgentType;
    pid: number;
    tmuxSession: string;
    cwd: string;
    startedAt: string;  // ISO 8601
    sessionId: string;
    sessionFilePath: string;
}

interface RegistryRow {
    name: string;
    type: AgentType;
    pid: number;
    tmux_session: string;
    cwd: string;
    started_at: string;
    session_id: string;
    session_file_path: string;
    updated_at: string;
}

const DEFAULT_REGISTRY_PATH = path.join(os.homedir(), '.ai-devkit', 'agents.json');
const DEFAULT_PRUNE_INTERVAL_MS = 30_000;

let defaultInstance: AgentRegistry | null = null;

export interface AgentRegistryOptions {
    now?: () => Date;
    pruneIntervalMs?: number;
    onDatabaseOperation?: (sql: string) => void;
}

export class AgentRegistry {
    private db: DatabaseConnection;
    private readonly now: () => Date;
    private readonly pruneIntervalMs: number;
    private lastPrunedAt: number | undefined;

    constructor(filePath: string = DEFAULT_REGISTRY_PATH, options: AgentRegistryOptions = {}) {
        this.now = options.now ?? (() => new Date());
        this.pruneIntervalMs = options.pruneIntervalMs ?? DEFAULT_PRUNE_INTERVAL_MS;
        this.db = new DatabaseConnection({
            dbPath: resolveAgentRegistryDbPath(filePath),
            verbose: options.onDatabaseOperation,
        });
    }

    static default(): AgentRegistry {
        if (!defaultInstance) {
            defaultInstance = new AgentRegistry();
        }
        return defaultInstance;
    }

    private rowToEntry(row: RegistryRow): RegistryEntry {
        return {
            name: row.name,
            type: row.type,
            pid: row.pid,
            tmuxSession: row.tmux_session,
            cwd: row.cwd,
            startedAt: row.started_at,
            sessionId: row.session_id,
            sessionFilePath: row.session_file_path,
        };
    }

    private mergeEntry(incoming: RegistryEntry, existing: RegistryEntry | undefined): RegistryEntry {
        if (!existing) return incoming;
        const incomingIsManaged = Boolean(incoming.tmuxSession);
        return {
            ...existing,
            name: incomingIsManaged ? incoming.name : existing.name,
            tmuxSession: incoming.tmuxSession || existing.tmuxSession,
            cwd: incoming.cwd || existing.cwd,
            startedAt: existing.startedAt || incoming.startedAt,
            sessionId: incoming.sessionId || existing.sessionId,
            sessionFilePath: incoming.sessionFilePath || existing.sessionFilePath,
        };
    }

    private findByIdentity(type: AgentType, pid: number): RegistryEntry | undefined {
        const row = this.db.queryOne<RegistryRow>(
            'SELECT * FROM agents WHERE type = ? AND pid = ?',
            [type, pid],
        );
        return row ? this.rowToEntry(row) : undefined;
    }

    private findByName(name: string): RegistryEntry | undefined {
        const row = this.db.queryOne<RegistryRow>('SELECT * FROM agents WHERE name = ?', [name]);
        return row ? this.rowToEntry(row) : undefined;
    }

    private findPidConflicts(type: AgentType, pid: number): RegistryEntry[] {
        return this.db.query<RegistryRow>(
            'SELECT * FROM agents WHERE pid = ? AND type <> ?',
            [pid, type],
        ).map((row) => this.rowToEntry(row));
    }

    private entriesEqual(left: RegistryEntry, right: RegistryEntry): boolean {
        return left.name === right.name
            && left.type === right.type
            && left.pid === right.pid
            && left.tmuxSession === right.tmuxSession
            && left.cwd === right.cwd
            && left.startedAt === right.startedAt
            && left.sessionId === right.sessionId
            && left.sessionFilePath === right.sessionFilePath;
    }

    private deleteNameConflict(name: string, type: AgentType, pid: number): void {
        const conflict = this.findByName(name);
        if (!conflict) return;
        if (conflict.type === type && conflict.pid === pid) return;
        if (!this.isAlive(conflict)) {
            this.db.execute('DELETE FROM agents WHERE type = ? AND pid = ?', [conflict.type, conflict.pid]);
        }
    }

    private insertOrUpdate(entry: RegistryEntry): void {
        this.db.instance.prepare(`
            INSERT INTO agents (
                type, pid, name, tmux_session, cwd, started_at, session_id, session_file_path, updated_at
            )
            VALUES (
                @type, @pid, @name, @tmuxSession, @cwd, @startedAt, @sessionId, @sessionFilePath, @updatedAt
            )
            ON CONFLICT(type, pid) DO UPDATE SET
                name = excluded.name,
                tmux_session = excluded.tmux_session,
                cwd = excluded.cwd,
                started_at = agents.started_at,
                session_id = excluded.session_id,
                session_file_path = excluded.session_file_path,
                updated_at = excluded.updated_at
        `).run({ ...entry, updatedAt: this.now().toISOString() });
    }

    private needsWrite(incoming: RegistryEntry): boolean {
        const existing = this.findByIdentity(incoming.type, incoming.pid);
        const merged = this.mergeEntry(incoming, existing);
        return !existing
            || !this.entriesEqual(merged, existing)
            || this.findPidConflicts(incoming.type, incoming.pid).length > 0;
    }

    private save(incoming: RegistryEntry): void {
        const existing = this.findByIdentity(incoming.type, incoming.pid);
        const merged = this.mergeEntry(incoming, existing);
        const pidConflicts = this.findPidConflicts(incoming.type, incoming.pid);
        if (existing && this.entriesEqual(merged, existing) && pidConflicts.length === 0) return;

        for (const conflict of pidConflicts) {
            this.db.execute('DELETE FROM agents WHERE type = ? AND pid = ?', [conflict.type, conflict.pid]);
        }
        if (existing && this.entriesEqual(merged, existing)) return;

        this.deleteNameConflict(merged.name, merged.type, merged.pid);
        this.insertOrUpdate(merged);
    }

    isAlive(entry: RegistryEntry): boolean {
        try {
            process.kill(entry.pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    private pruneAt(nowMs: number): void {
        const entries = this.list();
        const stale = entries.filter((e) => !this.isAlive(e));
        if (stale.length > 0) {
            this.db.transaction(() => {
                for (const entry of stale) {
                    this.db.execute('DELETE FROM agents WHERE type = ? AND pid = ?', [entry.type, entry.pid]);
                }
            });
        }
        this.lastPrunedAt = nowMs;
    }

    prune(): void {
        this.pruneAt(this.now().getTime());
    }

    pruneIfDue(): void {
        const nowMs = this.now().getTime();
        const elapsed = this.lastPrunedAt === undefined ? undefined : nowMs - this.lastPrunedAt;
        if (elapsed !== undefined && elapsed >= 0 && elapsed < this.pruneIntervalMs) return;
        this.pruneAt(nowMs);
    }

    register(entry: RegistryEntry): void {
        this.registerBatch([entry]);
    }

    registerBatch(entries: RegistryEntry[]): void {
        if (entries.length === 0) return;
        if (!entries.some((entry) => this.needsWrite(entry))) return;
        this.db.transaction(() => {
            for (const incoming of entries) {
                this.save(incoming);
            }
        });
    }

    rename(currentName: string, newName: string): void {
        const existing = this.findByName(currentName);
        if (!existing) {
            throw new RenameNotFoundError(currentName);
        }
        const conflict = this.findByName(newName);
        if (conflict && this.isAlive(conflict)) {
            throw new RenameConflictError(newName);
        }

        this.db.transaction(() => {
            if (conflict) {
                this.db.execute('DELETE FROM agents WHERE type = ? AND pid = ?', [conflict.type, conflict.pid]);
            }
            this.db.execute(
                'UPDATE agents SET name = ?, updated_at = ? WHERE type = ? AND pid = ?',
                [newName, this.now().toISOString(), existing.type, existing.pid],
            );
        });
    }

    lookup(name: string): RegistryEntry | null {
        return this.findByName(name) ?? null;
    }

    list(): RegistryEntry[] {
        const rows = this.db.query<RegistryRow>('SELECT * FROM agents ORDER BY started_at ASC, name ASC');
        return rows.map((row) => this.rowToEntry(row));
    }
}
