/**
 * Kiro Adapter
 *
 * Detects running Kiro agents by matching process IDs from
 * ~/.kiro/sessions/cli/<session-id>.lock to the sibling metadata and transcript files.
 */

import * as path from 'path';
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
import { isDirectory, safeReadFile, safeReaddir, safeStat } from '../utils/session.js';
import { generateAgentName } from '../utils/matching.js';

type KiroRecord = Record<string, unknown>;

interface KiroMetadata {
    sessionId: string;
    cwd: string;
    title: string;
    createdAt: Date | null;
    updatedAt: Date | null;
}

interface KiroLine {
    kind?: string;
    timestamp?: string;
    data?: KiroRecord;
}

interface KiroSession {
    sessionId: string;
    projectPath: string;
    summary: string;
    firstUserMessage: string;
    sessionStart: Date;
    lastActive: Date;
    lastEventKind?: string;
    lastAssistantHasToolUse: boolean;
    filePath: string;
}

interface KiroLock {
    sessionId: string;
    pid: number;
}

export class KiroAdapter implements AgentAdapter {
    readonly type = 'kiro' as const;

    private static readonly IDLE_THRESHOLD_MINUTES = 5;

    private kiroSessionsDir: string;

    constructor() {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.kiroSessionsDir = path.join(homeDir, '.kiro', 'sessions', 'cli');
    }

    canHandle(processInfo: ProcessInfo): boolean {
        return this.isKiroExecutable(processInfo.command);
    }

    async detectAgents(): Promise<AgentInfo[]> {
        const processes = enrichProcesses(this.listKiroProcesses());
        if (processes.length === 0) return [];

        const processByPid = new Map(processes.map((proc) => [proc.pid, proc]));
        const matchedPids = new Set<number>();
        const agents: AgentInfo[] = [];

        for (const lock of this.discoverActiveLocks()) {
            const proc = processByPid.get(lock.pid);
            if (!proc) continue;

            const session = this.readSession(lock.sessionId, proc.cwd);
            if (!session) continue;

            agents.push(this.mapSessionToAgent(session, proc));
            matchedPids.add(proc.pid);
        }

        for (const proc of processes) {
            if (!matchedPids.has(proc.pid)) {
                agents.push(this.mapProcessOnlyAgent(proc));
            }
        }

        return agents;
    }

    getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
        return this.entriesToMessages(
            this.readJsonl(sessionFilePath),
            options?.verbose ?? false,
        );
    }

    async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
        if (!isDirectory(this.kiroSessionsDir)) return [];

        const summaries: SessionSummary[] = [];
        for (const entry of safeReaddir(this.kiroSessionsDir)) {
            if (!entry.endsWith('.jsonl')) continue;

            const sessionId = entry.slice(0, -'.jsonl'.length);
            const session = this.readSession(sessionId);
            if (!session) continue;
            if (opts?.cwd !== undefined && session.projectPath !== opts.cwd) continue;

            summaries.push({
                type: this.type,
                sessionId: session.sessionId,
                cwd: session.projectPath,
                firstUserMessage: session.firstUserMessage,
                lastActive: session.lastActive,
                startedAt: session.sessionStart,
                sessionFilePath: session.filePath,
            });
        }
        return summaries;
    }

    private listKiroProcesses(): ProcessInfo[] {
        const byPid = new Map<number, ProcessInfo>();
        for (const proc of listAgentProcesses('kiro-cli')) {
            if (this.canHandle(proc)) byPid.set(proc.pid, proc);
        }
        for (const proc of listAgentProcesses('kiro')) {
            if (this.canHandle(proc)) byPid.set(proc.pid, proc);
        }
        for (const proc of listAgentProcesses('node')) {
            if (this.canHandle(proc)) byPid.set(proc.pid, proc);
        }
        return Array.from(byPid.values());
    }

    private discoverActiveLocks(): KiroLock[] {
        if (!isDirectory(this.kiroSessionsDir)) return [];

        const locks: KiroLock[] = [];
        for (const entry of safeReaddir(this.kiroSessionsDir)) {
            if (!entry.endsWith('.lock')) continue;

            const content = safeReadFile(path.join(this.kiroSessionsDir, entry));
            if (content === undefined) continue;

            try {
                const parsed = JSON.parse(content) as unknown;
                const record = this.asRecord(parsed);
                const pid = this.toPid(record?.pid);
                if (pid === null) continue;

                locks.push({
                    sessionId: entry.slice(0, -'.lock'.length),
                    pid,
                });
            } catch {
                continue;
            }
        }
        return locks;
    }

    private readSession(sessionId: string, fallbackCwd = ''): KiroSession | null {
        const filePath = path.join(this.kiroSessionsDir, `${sessionId}.jsonl`);
        const stat = safeStat(filePath);
        if (!stat?.isFile()) return null;

        const entries = this.readJsonl(filePath);
        const metadata = this.readMetadata(sessionId);
        const messages = this.entriesToMessages(entries, false);
        const userMessages = messages.filter((message) => message.role === 'user');
        const timestamps = entries
            .map((entry) => this.entryDate(entry))
            .filter((value): value is Date => value !== null);
        const sessionStart = metadata.createdAt ?? timestamps[0] ?? stat.birthtime ?? stat.mtime;
        const lastActive = metadata.updatedAt ?? timestamps[timestamps.length - 1] ?? stat.mtime;
        const lastEntry = entries[entries.length - 1];

        return {
            sessionId: metadata.sessionId || sessionId,
            projectPath: metadata.cwd || fallbackCwd,
            summary: this.truncate(userMessages.at(-1)?.content || metadata.title || 'Kiro session active', 120),
            firstUserMessage: userMessages[0]?.content ?? '',
            sessionStart,
            lastActive,
            lastEventKind: lastEntry?.kind,
            lastAssistantHasToolUse: lastEntry?.kind === 'AssistantMessage' && this.hasContentKind(lastEntry, 'toolUse'),
            filePath,
        };
    }

    private readMetadata(sessionId: string): KiroMetadata {
        const empty: KiroMetadata = {
            sessionId,
            cwd: '',
            title: '',
            createdAt: null,
            updatedAt: null,
        };
        const content = safeReadFile(path.join(this.kiroSessionsDir, `${sessionId}.json`));
        if (content === undefined) return empty;

        try {
            const parsed = this.asRecord(JSON.parse(content));
            if (!parsed) return empty;
            return {
                sessionId: this.firstString(parsed.session_id, parsed.sessionId) ?? sessionId,
                cwd: this.firstString(parsed.cwd) ?? '',
                title: this.firstString(parsed.title) ?? '',
                createdAt: this.parseDate(parsed.created_at ?? parsed.createdAt),
                updatedAt: this.parseDate(parsed.updated_at ?? parsed.updatedAt),
            };
        } catch {
            return empty;
        }
    }

    private readJsonl(filePath: string): KiroLine[] {
        const content = safeReadFile(filePath);
        if (content === undefined) return [];

        const entries: KiroLine[] = [];
        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const parsed = this.asRecord(JSON.parse(trimmed));
                if (parsed) entries.push(parsed as KiroLine);
            } catch {
                continue;
            }
        }
        return entries;
    }

    private entriesToMessages(entries: KiroLine[], verbose: boolean): ConversationMessage[] {
        const messages: ConversationMessage[] = [];
        for (const entry of entries) {
            const message = this.entryToMessage(entry, verbose);
            if (message) messages.push(message);
        }
        return messages;
    }

    private entryToMessage(entry: KiroLine, verbose: boolean): ConversationMessage | null {
        let role: ConversationMessage['role'];
        let content: string;

        if (entry.kind === 'Prompt') {
            role = 'user';
            content = this.textContent(entry);
        } else if (entry.kind === 'AssistantMessage') {
            role = 'assistant';
            const parts = [this.textContent(entry)];
            if (verbose) parts.push(...this.toolUseContent(entry));
            content = parts.filter(Boolean).join('\n');
        } else if (entry.kind === 'ToolResults' && verbose) {
            role = 'system';
            content = this.toolResultContent(entry).join('\n');
        } else {
            return null;
        }

        if (!content) return null;
        return {
            role,
            content,
            timestamp: this.entryTimestamp(entry),
        };
    }

    private textContent(entry: KiroLine): string {
        return this.contentBlocks(entry)
            .filter((block) => block.kind === 'text')
            .map((block) => typeof block.data === 'string' ? block.data : '')
            .filter(Boolean)
            .join('');
    }

    private toolUseContent(entry: KiroLine): string[] {
        return this.contentBlocks(entry)
            .filter((block) => block.kind === 'toolUse')
            .map((block) => {
                const data = this.asRecord(block.data);
                const name = this.firstString(data?.name) ?? 'unknown';
                const input = this.formatValue(data?.input);
                return `[Tool: ${name}]${input ? ` ${input}` : ''}`;
            });
    }

    private toolResultContent(entry: KiroLine): string[] {
        return this.contentBlocks(entry)
            .filter((block) => block.kind === 'toolResult')
            .map((block) => {
                const data = this.asRecord(block.data);
                const prefix = data?.status === 'error' ? '[Tool Error]' : '[Tool Result]';
                const result = this.formatValue(data?.result ?? data?.results ?? data?.content);
                return `${prefix}${result ? ` ${result}` : ''}`;
            });
    }

    private contentBlocks(entry: KiroLine): Array<{ kind?: string; data?: unknown }> {
        const content = entry.data?.content;
        if (!Array.isArray(content)) return [];
        return content
            .map((block) => this.asRecord(block))
            .filter((block): block is KiroRecord => block !== null);
    }

    private hasContentKind(entry: KiroLine, kind: string): boolean {
        return this.contentBlocks(entry).some((block) => block.kind === kind);
    }

    private entryTimestamp(entry: KiroLine): string | undefined {
        const direct = this.firstString(entry.timestamp);
        if (direct) return direct;

        const meta = this.asRecord(entry.data?.meta);
        const parsed = this.parseDate(meta?.timestamp);
        return parsed?.toISOString();
    }

    private entryDate(entry: KiroLine): Date | null {
        return this.parseDate(this.entryTimestamp(entry));
    }

    private mapSessionToAgent(session: KiroSession, processInfo: ProcessInfo): AgentInfo {
        const projectPath = session.projectPath || processInfo.cwd || '';
        return {
            name: generateAgentName(projectPath, processInfo.pid),
            type: this.type,
            status: this.determineStatus(session),
            summary: session.summary,
            pid: processInfo.pid,
            projectPath,
            sessionId: session.sessionId,
            lastActive: session.lastActive,
            sessionFilePath: session.filePath,
        };
    }

    private mapProcessOnlyAgent(processInfo: ProcessInfo): AgentInfo {
        return {
            name: generateAgentName(processInfo.cwd || '', processInfo.pid),
            type: this.type,
            status: AgentStatus.RUNNING,
            summary: 'Kiro process running',
            pid: processInfo.pid,
            projectPath: processInfo.cwd || '',
            sessionId: `pid-${processInfo.pid}`,
            lastActive: new Date(),
        };
    }

    private determineStatus(session: KiroSession): AgentStatus {
        const diffMinutes = (Date.now() - session.lastActive.getTime()) / 60000;
        if (diffMinutes > KiroAdapter.IDLE_THRESHOLD_MINUTES) return AgentStatus.IDLE;
        if (session.lastEventKind === 'AssistantMessage' && !session.lastAssistantHasToolUse) {
            return AgentStatus.WAITING;
        }
        return AgentStatus.RUNNING;
    }

    private isKiroExecutable(command: string): boolean {
        for (const token of command.trim().split(/\s+/)) {
            const base = path.basename(token).toLowerCase().replace(/\.(exe|js)$/, '');
            if (base === 'kiro-cli' || base === 'kiro') return true;
        }
        return false;
    }

    private toPid(value: unknown): number | null {
        if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
        if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
        const parsed = Number(value);
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
    }

    private parseDate(value: unknown): Date | null {
        if (typeof value === 'number') {
            const date = new Date(value < 1_000_000_000_000 ? value * 1000 : value);
            return Number.isNaN(date.getTime()) ? null : date;
        }
        if (typeof value !== 'string' || !value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    private firstString(...values: unknown[]): string | undefined {
        return values.find((value): value is string => typeof value === 'string' && value.length > 0);
    }

    private asRecord(value: unknown): KiroRecord | null {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        return value as KiroRecord;
    }

    private formatValue(value: unknown): string {
        if (typeof value === 'string') return value;
        if (value === undefined || value === null) return '';
        try {
            return JSON.stringify(value);
        } catch {
            return '';
        }
    }

    private truncate(value: string, maxLength: number): string {
        if (value.length <= maxLength) return value;
        return `${value.slice(0, maxLength - 3)}...`;
    }
}
