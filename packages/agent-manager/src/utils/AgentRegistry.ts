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

let defaultInstance: AgentRegistry | null = null;

export class AgentRegistry {
    private db: DatabaseConnection;

    constructor(filePath: string = DEFAULT_REGISTRY_PATH) {
        this.db = new DatabaseConnection({ dbPath: resolveAgentRegistryDbPath(filePath) });
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
            type: incoming.type,
            pid: incoming.pid,
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
        `).run({ ...entry, updatedAt: new Date().toISOString() });
    }

    private save(entry: RegistryEntry): void {
        this.deleteNameConflict(entry.name, entry.type, entry.pid);
        this.insertOrUpdate(entry);
    }

    isAlive(entry: RegistryEntry): boolean {
        try {
            process.kill(entry.pid, 0);
            return true;
        } catch (error) {
            const code = error && typeof error === 'object' && 'code' in error
                ? error.code
                : undefined;
            return code !== 'ESRCH';
        }
    }

    prune(): void {
        const entries = this.list();
        const stale = entries.filter((e) => !this.isAlive(e));
        this.db.transaction(() => {
            for (const entry of stale) {
                this.db.execute('DELETE FROM agents WHERE type = ? AND pid = ?', [entry.type, entry.pid]);
            }
        });
    }

    register(entry: RegistryEntry): void {
        this.db.transaction(() => {
            const existing = this.findByIdentity(entry.type, entry.pid);
            this.save(this.mergeEntry(entry, existing));
        });
    }

    registerBatch(entries: RegistryEntry[]): void {
        if (entries.length === 0) return;
        this.db.transaction(() => {
            const preExistingByName = new Map(this.list().map((entry) => [entry.name, entry]));
            for (const incoming of entries) {
                const existing = this.findByIdentity(incoming.type, incoming.pid);
                const nameOwner = preExistingByName.get(incoming.name);
                const transferSource = nameOwner?.type === incoming.type
                    && nameOwner.pid !== incoming.pid
                    ? nameOwner
                    : undefined;
                const merged = this.mergeEntry(incoming, transferSource ?? existing);

                if (transferSource) {
                    this.db.execute('DELETE FROM agents WHERE type = ? AND pid = ?', [
                        transferSource.type,
                        transferSource.pid,
                    ]);
                    if (existing) {
                        this.db.execute('DELETE FROM agents WHERE type = ? AND pid = ?', [
                            existing.type,
                            existing.pid,
                        ]);
                    }
                }

                this.save(merged);
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
                [newName, new Date().toISOString(), existing.type, existing.pid],
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
