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
    pinned: boolean;
    updatedAt?: string;
    deletedAt?: string | null;
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
    pinned: number;
    deleted_at: string | null;
}

const DEFAULT_REGISTRY_PATH = path.join(os.homedir(), '.ai-devkit', 'agents.json');
let defaultInstance: AgentRegistry | null = null;

export interface AgentRegistryOptions {
    now?: () => Date;
    onDatabaseOperation?: (sql: string) => void;
    readonly?: boolean;
}

export class AgentRegistry {
    private db: DatabaseConnection;
    private readonly now: () => Date;
    private readonly readonly: boolean;

    constructor(filePath: string = DEFAULT_REGISTRY_PATH, options: AgentRegistryOptions = {}) {
        this.now = options.now ?? (() => new Date());
        this.readonly = options.readonly ?? false;
        this.db = new DatabaseConnection({
            dbPath: resolveAgentRegistryDbPath(filePath),
            verbose: options.onDatabaseOperation,
            readonly: this.readonly,
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
            pinned: row.pinned !== 0,
            updatedAt: row.updated_at,
            deletedAt: row.deleted_at,
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

    private findByPid(type: AgentType, pid: number): RegistryEntry | undefined {
        const row = this.db.queryOne<RegistryRow>(
            'SELECT * FROM agents WHERE type = ? AND pid = ?',
            [type, pid],
        );
        return row ? this.rowToEntry(row) : undefined;
    }

    private findBySession(type: AgentType, sessionId: string): RegistryEntry | undefined {
        const row = this.db.queryOne<RegistryRow>(
            `SELECT * FROM agents
             WHERE type = ? AND session_id = ?
             ORDER BY (deleted_at IS NULL) DESC, updated_at DESC
             LIMIT 1`,
            [type, sessionId],
        );
        return row ? this.rowToEntry(row) : undefined;
    }

    private findByName(name: string): RegistryEntry | undefined {
        const row = this.db.queryOne<RegistryRow>('SELECT * FROM agents WHERE name = ?', [name]);
        return row ? this.rowToEntry(row) : undefined;
    }

    private uniqueName(baseName: string, heldNames: ReadonlySet<string>): string {
        if (!heldNames.has(baseName)) return baseName;
        let suffix = 2;
        while (heldNames.has(`${baseName}-${suffix}`)) suffix += 1;
        return `${baseName}-${suffix}`;
    }

    private displacePidConflict(type: AgentType, pid: number, sessionId: string, now: string): void {
        const conflict = this.findByPid(type, pid);
        if (!conflict || conflict.sessionId === sessionId) return;
        const minimum = this.db.queryOne<{ pid: number | null }>(
            'SELECT MIN(pid) AS pid FROM agents WHERE type = ? AND pid < 0',
            [type],
        )?.pid;
        const tombstonePid = minimum === null || minimum === undefined ? -1 : minimum - 1;
        this.db.execute(
            'UPDATE agents SET pid = ?, deleted_at = ?, updated_at = ? WHERE type = ? AND pid = ?',
            [tombstonePid, now, now, type, pid],
        );
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

    private insertOrUpdate(entry: RegistryEntry): void {
        this.db.instance.prepare(`
            INSERT INTO agents (
                type, pid, name, tmux_session, cwd, started_at, session_id, session_file_path, updated_at, deleted_at
            )
            VALUES (
                @type, @pid, @name, @tmuxSession, @cwd, @startedAt, @sessionId, @sessionFilePath, @updatedAt, @deletedAt
            )
            ON CONFLICT(type, pid) DO UPDATE SET
                name = excluded.name,
                tmux_session = excluded.tmux_session,
                cwd = excluded.cwd,
                started_at = agents.started_at,
                session_id = excluded.session_id,
                session_file_path = excluded.session_file_path,
                updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at
        `).run({ ...entry, updatedAt: this.now().toISOString(), deletedAt: entry.deletedAt ?? null });
    }

    private needsWrite(incoming: RegistryEntry): boolean {
        const existing = this.findByPid(incoming.type, incoming.pid);
        const merged = this.mergeEntry(incoming, existing);
        return !existing || !this.entriesEqual(merged, existing);
    }

    private save(incoming: RegistryEntry): void {
        const existing = this.findByPid(incoming.type, incoming.pid);
        const merged = this.mergeEntry(incoming, existing);
        if (existing && this.entriesEqual(merged, existing)) return;
        this.insertOrUpdate(merged);
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

    reconcile(detected: RegistryEntry[], successfulTypes: AgentType[]): RegistryEntry[] {
        if (this.readonly) {
            throw new Error('Agent registry is readonly; cannot reconcile agents.');
        }
        const now = this.now().toISOString();
        const successful = new Set(successfulTypes);

        return this.db.immediateTransaction(() => {
            const heldNames = new Set(this.list().map((entry) => entry.name));
            const detectedIdentities = new Set(detected.map((entry) => `${entry.type}\0${entry.sessionId}`));
            const restored: RegistryEntry[] = [];

            for (const incoming of detected) {
                const existing = this.findBySession(incoming.type, incoming.sessionId);
                this.displacePidConflict(incoming.type, incoming.pid, incoming.sessionId, now);

                if (existing) {
                    const cwd = incoming.cwd || existing.cwd;
                    const sessionFilePath = incoming.sessionFilePath || existing.sessionFilePath;
                    const unchanged = existing.pid === incoming.pid
                        && existing.deletedAt === null
                        && existing.cwd === cwd
                        && existing.sessionFilePath === sessionFilePath;
                    if (!unchanged) {
                        this.db.execute(`UPDATE agents SET
                            pid = ?, cwd = ?, session_file_path = ?, updated_at = ?, deleted_at = NULL
                            WHERE type = ? AND pid = ?`, [
                            incoming.pid, cwd, sessionFilePath, now, existing.type, existing.pid,
                        ]);
                    }
                    restored.push({
                        ...existing,
                        pid: incoming.pid,
                        cwd,
                        sessionFilePath,
                        updatedAt: unchanged ? existing.updatedAt : now,
                        deletedAt: null,
                    });
                    continue;
                }

                const name = this.uniqueName(incoming.name, heldNames);
                heldNames.add(name);
                const inserted = { ...incoming, name, deletedAt: null };
                this.insertOrUpdate(inserted);
                restored.push({ ...inserted, updatedAt: now });
            }

            for (const entry of this.list()) {
                const identity = `${entry.type}\0${entry.sessionId}`;
                if (successful.has(entry.type) && !detectedIdentities.has(identity) && entry.deletedAt === null) {
                    this.db.execute(
                        'UPDATE agents SET deleted_at = ?, updated_at = ? WHERE type = ? AND pid = ?',
                        [now, now, entry.type, entry.pid],
                    );
                }
            }

            return restored;
        });
    }

    rename(currentName: string, newName: string): void {
        const existing = this.findByName(currentName);
        if (!existing) {
            throw new RenameNotFoundError(currentName);
        }
        const conflict = this.findByName(newName);
        if (conflict) {
            throw new RenameConflictError(newName);
        }

        this.db.transaction(() => {
            this.db.execute(
                'UPDATE agents SET name = ?, updated_at = ? WHERE type = ? AND pid = ?',
                [newName, this.now().toISOString(), existing.type, existing.pid],
            );
        });
    }

    togglePin(type: AgentType, pid: number): boolean | null {
        if (this.readonly) {
            throw new Error('Agent registry is readonly; cannot toggle pin.');
        }
        const result = this.db.execute(
            'UPDATE agents SET pinned = NOT pinned, updated_at = ? WHERE type = ? AND pid = ?',
            [this.now().toISOString(), type, pid],
        );
        if (result.changes === 0) return null;
        return this.findByPid(type, pid)?.pinned ?? null;
    }

    remove(type: AgentType, pid: number): boolean {
        if (this.readonly) {
            throw new Error('Agent registry is readonly; cannot remove an agent.');
        }
        return this.db.execute(
            'DELETE FROM agents WHERE type = ? AND pid = ?',
            [type, pid],
        ).changes > 0;
    }

    lookup(name: string): RegistryEntry | null {
        return this.findByName(name) ?? null;
    }

    list(): RegistryEntry[] {
        const rows = this.db.query<RegistryRow>('SELECT * FROM agents ORDER BY started_at ASC, name ASC');
        return rows.map((row) => this.rowToEntry(row));
    }
}
