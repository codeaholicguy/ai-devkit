/**
 * OpenCode Adapter
 *
 * Detects running OpenCode agents by:
 * 1. Finding running opencode processes via shared listAgentProcesses()
 * 2. Enriching with CWD and start times via shared enrichProcesses()
 * 3. Querying OpenCode's SQLite DB (~/.local/share/opencode/opencode.db) to
 *    find the session matching each process's CWD and read status from message.time.completed
 *
 * sessionFilePath encodes "<dbPath>::<sessionId>" so getConversation() can open the right
 * DB row without extending the AgentAdapter interface.
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import type {
    AgentAdapter,
    AgentInfo,
    ProcessInfo,
    ConversationMessage,
    SessionSummary,
    ListSessionsOptions,
} from './AgentAdapter.js';
import { AgentStatus } from './AgentAdapter.js';
import { listAgentProcesses, enrichProcesses } from '../utils/process.js';
import { generateAgentName } from '../utils/matching.js';

const SESSION_REF_SEP = '::';

function encodeSessionRef(dbPath: string, sessionId: string): string {
    return `${dbPath}${SESSION_REF_SEP}${sessionId}`;
}

function decodeSessionRef(ref: string): { dbPath: string; sessionId: string } | null {
    const idx = ref.lastIndexOf(SESSION_REF_SEP);
    if (idx === -1) return null;
    return { dbPath: ref.slice(0, idx), sessionId: ref.slice(idx + SESSION_REF_SEP.length) };
}

interface OpenCodeSession {
    sessionId: string;
    directory: string;
    timeCreated: number;
}

interface OpenCodeSessionStats {
    lastRole: string | null;
    lastTimeUpdated: number;
    /** OpenCode writes `time.completed` on the assistant message only when the turn finishes. */
    lastAssistantCompleted: boolean;
    lastAssistantErrored: boolean;
    summary: string;
}

export class OpenCodeAdapter implements AgentAdapter {
    readonly type = 'opencode' as const;

    private static readonly IDLE_THRESHOLD_MINUTES = 5;

    private readonly dbPath: string;
    private db: Database.Database | null = null;

    constructor() {
        this.dbPath = OpenCodeAdapter.resolveDbPath();
        const cleanup = (): void => this.close();
        process.once('exit', cleanup);
        process.once('SIGINT', cleanup);
        process.once('SIGTERM', cleanup);
    }

    close(): void {
        if (this.db) {
            try { this.db.close(); } catch { /* ignore */ }
            this.db = null;
        }
    }

    private static resolveDbPath(): string {
        const xdg = process.env.XDG_DATA_HOME;
        const home = process.env.HOME || process.env.USERPROFILE || '';
        const base = xdg || path.join(home, '.local', 'share');
        return path.join(base, 'opencode', 'opencode.db');
    }

    canHandle(processInfo: ProcessInfo): boolean {
        const exe = (processInfo.command.trim().split(/\s+/)[0] || '').toLowerCase();
        const base = path.basename(exe);
        return base === 'opencode' || base === 'opencode.exe';
    }

    async detectAgents(): Promise<AgentInfo[]> {
        const processes = enrichProcesses(listAgentProcesses('opencode'));
        if (processes.length === 0) return [];

        const db = this.openDb();
        if (!db) return processes.map((p) => this.mapProcessOnlyAgent(p));

        const agents: AgentInfo[] = [];
        for (const proc of processes) {
            if (!proc.cwd) {
                agents.push(this.mapProcessOnlyAgent(proc));
                continue;
            }

            const session = this.findSessionForDirectory(db, proc.cwd);
            if (!session) {
                agents.push(this.mapProcessOnlyAgent(proc));
                continue;
            }

            const stats = this.getSessionStats(db, session.sessionId);
            agents.push(this.mapSessionToAgent(session, stats, proc));
        }

        return agents;
    }

    getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
        const verbose = options?.verbose ?? false;
        const ref = decodeSessionRef(sessionFilePath);
        if (!ref) return [];

        const db = this.openDb();
        if (!db) return [];

        try {
            const rows = db.prepare<[string], { role: string; partData: string; timeCreated: number }>(`
                SELECT json_extract(m.data, '$.role') AS role,
                       p.data AS partData,
                       p.time_created AS timeCreated
                FROM part p
                JOIN message m ON p.message_id = m.id
                WHERE p.session_id = ?
                ORDER BY p.time_created ASC
            `).all(ref.sessionId);

            const messages: ConversationMessage[] = [];

            for (const row of rows) {
                let partData: { type?: string; text?: string; reasoning?: string; tool?: string } = {};
                try {
                    partData = JSON.parse(row.partData);
                } catch {
                    continue;
                }

                const role = row.role === 'user' ? 'user' : 'assistant';

                if (partData.type === 'text' && partData.text) {
                    messages.push({ role, content: partData.text });
                } else if (partData.type === 'reasoning' && verbose) {
                    const text = partData.reasoning || partData.text || '';
                    if (text) messages.push({ role: 'assistant', content: `[thinking] ${text}` });
                } else if (partData.type === 'tool' && verbose) {
                    const toolName = partData.tool || 'tool';
                    messages.push({ role: 'assistant', content: `[tool: ${toolName}]` });
                }
            }

            return messages;
        } catch {
            this.close();
            return [];
        }
    }

    async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
        const db = this.openDb();
        if (!db) return [];

        try {
            const rows = db.prepare<[], { id: string; directory: string; timeCreated: number }>(`
                SELECT id, directory, time_created AS timeCreated
                FROM session
                ORDER BY time_created DESC
            `).all();

            const summaries: SessionSummary[] = [];

            for (const row of rows) {
                if (opts?.cwd !== undefined && row.directory !== opts.cwd) continue;

                const stats = this.getSessionStats(db, row.id);
                const lastActive = stats.lastTimeUpdated > 0
                    ? new Date(stats.lastTimeUpdated)
                    : new Date(row.timeCreated);
                const startedAt = new Date(row.timeCreated);

                summaries.push({
                    type: 'opencode',
                    sessionId: row.id,
                    cwd: row.directory,
                    firstUserMessage: stats.summary,
                    lastActive,
                    startedAt,
                    sessionFilePath: encodeSessionRef(this.dbPath, row.id),
                });
            }

            return summaries;
        } catch {
            this.close();
            return [];
        }
    }

    private findSessionForDirectory(db: Database.Database, directory: string): OpenCodeSession | null {
        try {
            const row = db.prepare<[string], { id: string; directory: string; time_created: number }>(`
                SELECT id, directory, time_created
                FROM session
                WHERE directory = ?
                ORDER BY time_created DESC
                LIMIT 1
            `).get(directory);

            if (!row) return null;
            return { sessionId: row.id, directory: row.directory, timeCreated: row.time_created };
        } catch {
            return null;
        }
    }

    private getSessionStats(db: Database.Database, sessionId: string): OpenCodeSessionStats {
        const empty: OpenCodeSessionStats = {
            lastRole: null,
            lastTimeUpdated: 0,
            lastAssistantCompleted: false,
            lastAssistantErrored: false,
            summary: '',
        };

        try {
            // Order by time_created — time_updated can lag when OpenCode appends
            // metadata (e.g. summary diffs) to user messages after a turn finishes.
            const last = db.prepare<[string], { role: string; timeUpdated: number }>(`
                SELECT json_extract(data, '$.role') AS role,
                       time_updated AS timeUpdated
                FROM message
                WHERE session_id = ?
                ORDER BY time_created DESC
                LIMIT 1
            `).get(sessionId);

            const heartbeat = db.prepare<[string], { maxUpdated: number }>(`
                SELECT MAX(time_updated) AS maxUpdated FROM message WHERE session_id = ?
            `).get(sessionId);

            const lastAssistant = db.prepare<[string], {
                completed: number | null;
                errored: number | null;
            }>(`
                SELECT json_extract(data, '$.time.completed') AS completed,
                       json_extract(data, '$.time.error') AS errored
                FROM message
                WHERE session_id = ? AND json_extract(data, '$.role') = 'assistant'
                ORDER BY time_created DESC
                LIMIT 1
            `).get(sessionId);

            const first = db.prepare<[string], { text: string }>(`
                SELECT json_extract(p.data, '$.text') AS text
                FROM part p
                JOIN message m ON p.message_id = m.id
                WHERE p.session_id = ?
                  AND json_extract(m.data, '$.role') = 'user'
                  AND json_extract(p.data, '$.type') = 'text'
                  AND json_extract(p.data, '$.text') IS NOT NULL
                ORDER BY p.time_created ASC
                LIMIT 1
            `).get(sessionId);

            return {
                lastRole: last?.role ?? null,
                lastTimeUpdated: heartbeat?.maxUpdated ?? last?.timeUpdated ?? 0,
                lastAssistantCompleted: lastAssistant?.completed != null,
                lastAssistantErrored: lastAssistant?.errored != null,
                summary: first?.text?.trim() ?? '',
            };
        } catch {
            return empty;
        }
    }

    private mapSessionToAgent(
        session: OpenCodeSession,
        stats: OpenCodeSessionStats,
        proc: ProcessInfo,
    ): AgentInfo {
        const lastActive = stats.lastTimeUpdated > 0
            ? new Date(stats.lastTimeUpdated)
            : new Date(session.timeCreated);

        return {
            name: generateAgentName(session.directory || proc.cwd || '', proc.pid),
            type: this.type,
            status: this.determineStatus(stats, lastActive),
            summary: stats.summary || 'OpenCode session active',
            pid: proc.pid,
            projectPath: session.directory || proc.cwd || '',
            sessionId: session.sessionId,
            lastActive,
            sessionFilePath: encodeSessionRef(this.dbPath, session.sessionId),
        };
    }

    private mapProcessOnlyAgent(proc: ProcessInfo): AgentInfo {
        return {
            name: generateAgentName(proc.cwd || '', proc.pid),
            type: this.type,
            status: AgentStatus.RUNNING,
            summary: 'OpenCode process running',
            pid: proc.pid,
            projectPath: proc.cwd || '',
            sessionId: `pid-${proc.pid}`,
            lastActive: new Date(),
        };
    }

    private determineStatus(stats: OpenCodeSessionStats, lastActive: Date): AgentStatus {
        const ageMin = (Date.now() - lastActive.getTime()) / 60000;
        if (ageMin > OpenCodeAdapter.IDLE_THRESHOLD_MINUTES) return AgentStatus.IDLE;

        if (stats.lastRole === 'assistant' && !stats.lastAssistantCompleted) return AgentStatus.RUNNING;
        if (stats.lastRole === 'assistant') return AgentStatus.WAITING;
        return AgentStatus.RUNNING;
    }

    private openDb(): Database.Database | null {
        if (this.db) return this.db;
        if (!fs.existsSync(this.dbPath)) return null;
        try {
            this.db = new Database(this.dbPath, { readonly: true });
            return this.db;
        } catch {
            return null;
        }
    }
}
