/**
 * Codex Adapter
 *
 * Detects running Codex agents by:
 * 1. Finding running codex processes via shared listAgentProcesses()
 * 2. Enriching with CWD and start times via shared enrichProcesses()
 * 3. Discovering session files from ~/.codex/sessions/YYYY/MM/DD/ via shared batchGetSessionFileBirthtimes()
 * 4. Setting resolvedCwd from session_meta first line
 * 5. Matching sessions to processes via shared matchProcessesToSessions()
 * 6. Extracting summary from last event entry in session JSONL
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AgentAdapter, AgentInfo, ProcessInfo, ConversationMessage } from './AgentAdapter';
import { AgentStatus } from './AgentAdapter';
import { listAgentProcesses, enrichProcesses } from '../utils/process';
import { batchGetSessionFileBirthtimes } from '../utils/session';
import type { SessionFile } from '../utils/session';
import { matchProcessesToSessions, generateAgentName } from '../utils/matching';

interface CodexEventEntry {
    timestamp?: string;
    type?: string;
    payload?: {
        type?: string;
        message?: string;
        id?: string;
        cwd?: string;
        timestamp?: string;
    };
}

interface CodexSession {
    sessionId: string;
    projectPath: string;
    summary: string;
    sessionStart: Date;
    lastActive: Date;
    lastPayloadType?: string;
}

export class CodexAdapter implements AgentAdapter {
    readonly type = 'codex' as const;

    private static readonly IDLE_THRESHOLD_MINUTES = 5;
    /** Include session files around process start day to recover long-lived processes. */
    private static readonly PROCESS_START_DAY_WINDOW_DAYS = 1;

    private codexSessionsDir: string;

    constructor() {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.codexSessionsDir = path.join(homeDir, '.codex', 'sessions');
    }

    canHandle(processInfo: ProcessInfo): boolean {
        return this.isCodexExecutable(processInfo.command);
    }

    /**
     * Detect running Codex agents
     */
    async detectAgents(): Promise<AgentInfo[]> {
        const processes = enrichProcesses(listAgentProcesses('codex'));
        if (processes.length === 0) return [];

        const { sessions, contentCache } = this.discoverSessions(processes);
        if (sessions.length === 0) {
            return processes.map((p) => this.mapProcessOnlyAgent(p));
        }

        const matches = matchProcessesToSessions(processes, sessions);
        const matchedPids = new Set(matches.map((m) => m.process.pid));
        const agents: AgentInfo[] = [];

        for (const match of matches) {
            const cachedContent = contentCache.get(match.session.filePath);
            const sessionData = this.parseSession(cachedContent, match.session.filePath);
            if (sessionData) {
                agents.push(this.mapSessionToAgent(sessionData, match.process, match.session.filePath));
            } else {
                matchedPids.delete(match.process.pid);
            }
        }

        for (const proc of processes) {
            if (!matchedPids.has(proc.pid)) {
                agents.push(this.mapProcessOnlyAgent(proc));
            }
        }

        return agents;
    }

    /**
     * Discover session files for the given processes.
     *
     * Uses process start times to determine which YYYY/MM/DD date directories
     * to scan (±1 day window), then batches stat calls across all directories.
     * Reads each file once and caches content for later parsing by parseSession().
     * Sets resolvedCwd from session_meta first line.
     */
    private discoverSessions(processes: ProcessInfo[]): {
        sessions: SessionFile[];
        contentCache: Map<string, string>;
    } {
        const empty = { sessions: [], contentCache: new Map<string, string>() };
        if (!fs.existsSync(this.codexSessionsDir)) return empty;

        const dateDirs = this.getDateDirs(processes);
        if (dateDirs.length === 0) return empty;

        const files = batchGetSessionFileBirthtimes(dateDirs);
        const contentCache = new Map<string, string>();

        // Read each file once: extract CWD for matching, cache content for later parsing
        for (const file of files) {
            try {
                const content = fs.readFileSync(file.filePath, 'utf-8');
                contentCache.set(file.filePath, content);

                const firstLine = content.split('\n')[0]?.trim();
                if (firstLine) {
                    const parsed = JSON.parse(firstLine);
                    if (parsed.type === 'session_meta') {
                        file.resolvedCwd = parsed.payload?.cwd || '';
                    }
                }
            } catch {
                // Skip unreadable files
            }
        }

        return { sessions: files, contentCache };
    }

    /**
     * Determine which date directories to scan based on process start times.
     * Returns only directories that actually exist.
     */
    private getDateDirs(processes: ProcessInfo[]): string[] {
        const dayKeys = new Set<string>();
        const window = CodexAdapter.PROCESS_START_DAY_WINDOW_DAYS;

        for (const proc of processes) {
            const startTime = proc.startTime || new Date();
            for (let offset = -window; offset <= window; offset++) {
                const day = new Date(startTime.getTime());
                day.setDate(day.getDate() + offset);
                dayKeys.add(this.toSessionDayKey(day));
            }
        }

        const dirs: string[] = [];
        for (const dayKey of dayKeys) {
            const dayDir = path.join(this.codexSessionsDir, dayKey);
            try {
                if (fs.statSync(dayDir).isDirectory()) {
                    dirs.push(dayDir);
                }
            } catch {
                continue;
            }
        }

        return dirs;
    }

    private toSessionDayKey(date: Date): string {
        const yyyy = String(date.getFullYear()).padStart(4, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return path.join(yyyy, mm, dd);
    }

    /**
     * Parse session file content into CodexSession.
     * Uses cached content if available, otherwise reads from disk.
     */
    private parseSession(cachedContent: string | undefined, filePath: string): CodexSession | null {
        let content: string;
        if (cachedContent !== undefined) {
            content = cachedContent;
        } else {
            try {
                content = fs.readFileSync(filePath, 'utf-8');
            } catch {
                return null;
            }
        }

        const allLines = content.trim().split('\n');
        if (!allLines[0]) return null;

        let metaEntry: CodexEventEntry;
        try {
            metaEntry = JSON.parse(allLines[0]);
        } catch {
            return null;
        }

        if (metaEntry.type !== 'session_meta' || !metaEntry.payload?.id) {
            return null;
        }

        const entries: CodexEventEntry[] = [];
        for (const line of allLines) {
            try {
                entries.push(JSON.parse(line));
            } catch {
                continue;
            }
        }

        const lastEntry = this.findLastEventEntry(entries);
        const lastPayloadType = lastEntry?.payload?.type;

        const lastActive =
            this.parseTimestamp(lastEntry?.timestamp) ||
            this.parseTimestamp(metaEntry.payload.timestamp) ||
            fs.statSync(filePath).mtime;
        const sessionStart =
            this.parseTimestamp(metaEntry.payload.timestamp) ||
            lastActive;

        return {
            sessionId: metaEntry.payload.id,
            projectPath: metaEntry.payload.cwd || '',
            summary: this.extractSummary(entries),
            sessionStart,
            lastActive,
            lastPayloadType,
        };
    }

    private mapSessionToAgent(session: CodexSession, processInfo: ProcessInfo, filePath: string): AgentInfo {
        return {
            name: generateAgentName(session.projectPath || processInfo.cwd || '', processInfo.pid),
            type: this.type,
            status: this.determineStatus(session),
            summary: session.summary || 'Codex session active',
            pid: processInfo.pid,
            projectPath: session.projectPath || processInfo.cwd || '',
            sessionId: session.sessionId,
            lastActive: session.lastActive,
            sessionFilePath: filePath,
        };
    }

    private mapProcessOnlyAgent(processInfo: ProcessInfo): AgentInfo {
        return {
            name: generateAgentName(processInfo.cwd || '', processInfo.pid),
            type: this.type,
            status: AgentStatus.RUNNING,
            summary: 'Codex process running',
            pid: processInfo.pid,
            projectPath: processInfo.cwd || '',
            sessionId: `pid-${processInfo.pid}`,
            lastActive: new Date(),
        };
    }

    private findLastEventEntry(entries: CodexEventEntry[]): CodexEventEntry | undefined {
        for (let i = entries.length - 1; i >= 0; i--) {
            const entry = entries[i];
            if (entry && typeof entry.type === 'string') {
                return entry;
            }
        }
        return undefined;
    }

    private parseTimestamp(value?: string): Date | null {
        if (!value) return null;
        const timestamp = new Date(value);
        return Number.isNaN(timestamp.getTime()) ? null : timestamp;
    }

    private determineStatus(session: CodexSession): AgentStatus {
        const diffMs = Date.now() - session.lastActive.getTime();
        const diffMinutes = diffMs / 60000;

        if (diffMinutes > CodexAdapter.IDLE_THRESHOLD_MINUTES) {
            return AgentStatus.IDLE;
        }

        if (
            session.lastPayloadType === 'agent_message' ||
            session.lastPayloadType === 'task_complete' ||
            session.lastPayloadType === 'turn_aborted'
        ) {
            return AgentStatus.WAITING;
        }

        return AgentStatus.RUNNING;
    }

    private extractSummary(entries: CodexEventEntry[]): string {
        for (let i = entries.length - 1; i >= 0; i--) {
            const message = entries[i]?.payload?.message;
            if (typeof message === 'string' && message.trim().length > 0) {
                return this.truncate(message.trim(), 120);
            }
        }

        return 'Codex session active';
    }

    private truncate(value: string, maxLength: number): string {
        if (value.length <= maxLength) return value;
        return `${value.slice(0, maxLength - 3)}...`;
    }

    private isCodexExecutable(command: string): boolean {
        const executable = command.trim().split(/\s+/)[0] || '';
        const base = path.basename(executable).toLowerCase();
        return base === 'codex' || base === 'codex.exe';
    }

    /**
     * Read the full conversation from a Codex session JSONL file.
     *
     * Codex entries use payload.type to indicate message role and payload.message for content.
     */
    getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
        const verbose = options?.verbose ?? false;

        let content: string;
        try {
            content = fs.readFileSync(sessionFilePath, 'utf-8');
        } catch {
            return [];
        }

        const lines = content.trim().split('\n');
        const messages: ConversationMessage[] = [];

        for (const line of lines) {
            let entry: CodexEventEntry;
            try {
                entry = JSON.parse(line);
            } catch {
                continue;
            }

            if (entry.type === 'session_meta') continue;

            const payloadType = entry.payload?.type;
            if (!payloadType) continue;

            let role: ConversationMessage['role'];
            if (payloadType === 'user_message') {
                role = 'user';
            } else if (payloadType === 'agent_message' || payloadType === 'task_complete') {
                role = 'assistant';
            } else if (verbose) {
                role = 'system';
            } else {
                continue;
            }

            const text = entry.payload?.message?.trim();
            if (!text) continue;

            messages.push({
                role,
                content: text,
                timestamp: entry.timestamp,
            });
        }

        return messages;
    }
}
