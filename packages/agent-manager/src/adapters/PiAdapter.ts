/**
 * Pi Adapter
 *
 * Detects running Pi agents by:
 * 1. Finding running Pi processes
 * 2. Matching exact PID-to-session metadata from ~/.pi/agent/sessions.json
 * 3. Falling back to shared process/session matching over Pi JSONL session files
 * 4. Parsing Pi JSONL entries defensively for summary and conversation output
 */

import * as fs from 'fs';
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
import type { SessionFile } from '../utils/session.js';
import { matchProcessesToSessions, generateAgentName } from '../utils/matching.js';
import { AgentRegistry } from '../utils/AgentRegistry.js';

interface PiSession {
    sessionId: string;
    projectPath: string;
    summary: string;
    sessionStart: Date;
    lastActive: Date;
    lastRole?: ConversationMessage['role'];
}

interface PiLine {
    timestamp?: string;
    role?: string;
    type?: string;
    content?: unknown;
    text?: unknown;
    message?: unknown;
    sessionId?: string;
    session_id?: string;
    id?: string;
    cwd?: string;
    projectPath?: string;
    project_path?: string;
    payload?: Record<string, unknown>;
    data?: Record<string, unknown>;
    [key: string]: unknown;
}

type PiRecord = Record<string, unknown>;

interface TrackerMatch {
    process: ProcessInfo;
    filePath: string;
}

interface TrackerAgentResult {
    agents: AgentInfo[];
    fallback: ProcessInfo[];
}

export class PiAdapter implements AgentAdapter {
    readonly type = 'pi' as const;

    private static readonly IDLE_THRESHOLD_MINUTES = 5;

    private piAgentDir: string;
    private piSessionsDir: string;
    private trackerPath: string;
    private registry: AgentRegistry;

    constructor(registry: AgentRegistry = AgentRegistry.default()) {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.piAgentDir = path.join(homeDir, '.pi', 'agent');
        this.piSessionsDir = path.join(this.piAgentDir, 'sessions');
        this.trackerPath = path.join(this.piAgentDir, 'sessions.json');
        this.registry = registry;
    }

    canHandle(processInfo: ProcessInfo): boolean {
        return this.isPiExecutable(processInfo.command);
    }

    async detectAgents(): Promise<AgentInfo[]> {
        const processes = enrichProcesses(this.listPiProcesses());
        if (processes.length === 0) return [];

        const { cachedAgents, remaining } = this.tryRegistryCache(processes);
        if (remaining.length === 0) return cachedAgents;

        const trackerResult = this.mapTrackerMatches(remaining);
        const fallbackAgents = this.mapFallbackMatches(trackerResult.fallback);

        return [
            ...cachedAgents,
            ...trackerResult.agents,
            ...fallbackAgents,
        ];
    }

    private mapTrackerMatches(processes: ProcessInfo[]): TrackerAgentResult {
        const { matches: trackerMatches, fallback } = this.matchFromTracker(processes);
        const agents: AgentInfo[] = [];

        for (const match of trackerMatches) {
            const session = this.parseSession(match.filePath, match.process.cwd);
            if (session) {
                agents.push(this.mapSessionToAgent(session, match.process, match.filePath));
            } else {
                fallback.push(match.process);
            }
        }

        return { agents, fallback };
    }

    private mapFallbackMatches(processes: ProcessInfo[]): AgentInfo[] {
        if (processes.length === 0) return [];

        const sessions = this.discoverSessions(processes);
        if (sessions.length === 0) {
            return processes.map((p) => this.mapProcessOnlyAgent(p));
        }

        const matches = matchProcessesToSessions(processes, sessions);
        const matchedPids = new Set(matches.map((m) => m.process.pid));
        const agents: AgentInfo[] = [];

        for (const match of matches) {
            const session = this.parseSession(match.session.filePath, match.process.cwd);
            if (session) {
                agents.push(this.mapSessionToAgent(session, match.process, match.session.filePath));
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

    private listPiProcesses(): ProcessInfo[] {
        const byPid = new Map<number, ProcessInfo>();
        for (const proc of listAgentProcesses('pi')) {
            if (this.canHandle(proc)) byPid.set(proc.pid, proc);
        }
        for (const proc of listAgentProcesses('node')) {
            if (this.canHandle(proc)) byPid.set(proc.pid, proc);
        }
        return Array.from(byPid.values());
    }

    private tryRegistryCache(processes: ProcessInfo[]): {
        cachedAgents: AgentInfo[];
        remaining: ProcessInfo[];
    } {
        const cachedAgents: AgentInfo[] = [];
        const remaining: ProcessInfo[] = [];
        const byPid = new Map(this.registry.list().map((e) => [e.pid, e]));

        for (const proc of processes) {
            const entry = byPid.get(proc.pid);
            if (
                !entry ||
                entry.type !== this.type ||
                !entry.sessionFilePath ||
                !fs.existsSync(entry.sessionFilePath)
            ) {
                remaining.push(proc);
                continue;
            }

            const session = this.parseSession(entry.sessionFilePath, proc.cwd);
            if (!session) {
                remaining.push(proc);
                continue;
            }

            cachedAgents.push(this.mapSessionToAgent(session, proc, entry.sessionFilePath));
        }

        return { cachedAgents, remaining };
    }

    private matchFromTracker(processes: ProcessInfo[]): {
        matches: TrackerMatch[];
        fallback: ProcessInfo[];
    } {
        const tracker = this.readTracker();
        if (tracker.size === 0) return { matches: [], fallback: processes };

        const matches: TrackerMatch[] = [];
        const fallback: ProcessInfo[] = [];

        for (const proc of processes) {
            const filePath = tracker.get(proc.pid);
            if (!filePath || !this.isTrustedSessionPath(filePath) || !fs.existsSync(filePath)) {
                fallback.push(proc);
                continue;
            }
            matches.push({ process: proc, filePath });
        }

        return { matches, fallback };
    }

    private readTracker(): Map<number, string> {
        const content = safeReadFile(this.trackerPath);
        if (content === undefined) return new Map();

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch {
            return new Map();
        }

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();

        const map = new Map<number, string>();
        for (const [key, value] of Object.entries(parsed)) {
            const keyPid = this.toPid(key);
            if (keyPid !== null && typeof value === 'string' && value) {
                map.set(keyPid, value);
            }
        }
        return map;
    }

    private toPid(value: unknown): number | null {
        if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
        if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
        const parsed = Number(value);
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
    }

    private isTrustedSessionPath(filePath: string): boolean {
        const resolvedRoot = path.resolve(this.piSessionsDir);
        const resolvedPath = path.resolve(filePath);
        return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`);
    }

    private discoverSessions(processes: ProcessInfo[] = []): SessionFile[] {
        if (!isDirectory(this.piSessionsDir)) return [];

        const cwdByProjectDir = this.buildProjectDirCwdMap(processes);
        const sessions: SessionFile[] = [];
        for (const filePath of this.collectJsonlFiles(this.piSessionsDir)) {
            const stat = safeStat(filePath);
            if (!stat) continue;

            const session = this.parseSession(filePath);
            const sessionId = session?.sessionId || this.sessionIdFromFile(filePath);
            const projectDir = path.dirname(filePath);
            sessions.push({
                sessionId,
                filePath,
                projectDir,
                birthtimeMs: stat.birthtimeMs || stat.mtimeMs,
                resolvedCwd: session?.projectPath || cwdByProjectDir.get(path.basename(projectDir)) || '',
            });
        }

        return sessions;
    }

    private buildProjectDirCwdMap(processes: ProcessInfo[]): Map<string, string> {
        const map = new Map<string, string>();
        for (const proc of processes) {
            if (!proc.cwd) continue;
            map.set(this.encodeProjectDir(proc.cwd), proc.cwd);
        }
        return map;
    }

    private collectJsonlFiles(dir: string): string[] {
        const files: string[] = [];
        for (const entry of safeReaddir(dir)) {
            const fullPath = path.join(dir, entry);
            const stat = safeStat(fullPath);
            if (!stat) continue;
            if (stat.isDirectory()) {
                files.push(...this.collectJsonlFiles(fullPath));
            } else if (stat.isFile() && entry.endsWith('.jsonl')) {
                files.push(fullPath);
            }
        }
        return files;
    }

    private parseSession(filePath: string, fallbackCwd = ''): PiSession | null {
        const entries = this.readJsonl(filePath);
        if (entries.length === 0) return null;
        return this.sessionFromEntries(entries, filePath, fallbackCwd);
    }

    private sessionFromEntries(entries: PiLine[], filePath: string, fallbackCwd = ''): PiSession {
        const stat = safeStat(filePath);
        const timestamps = entries
            .map((entry) => this.parseTimestamp(this.entryTimestamp(entry)))
            .filter((value): value is Date => value !== null);

        const sessionStart = timestamps[0] ?? stat?.birthtime ?? stat?.mtime ?? new Date();
        const lastActive = timestamps[timestamps.length - 1] ?? stat?.mtime ?? sessionStart;
        const messages = this.entriesToMessages(entries, true);
        const lastUser = [...messages].reverse().find((msg) => msg.role === 'user');
        const lastMessage = messages[messages.length - 1];

        return {
            sessionId: this.sessionIdFromEntries(entries) || this.sessionIdFromFile(filePath),
            projectPath: this.cwdFromEntries(entries) || fallbackCwd,
            summary: lastUser?.content ? this.truncate(lastUser.content, 120) : 'Pi session active',
            sessionStart,
            lastActive,
            lastRole: lastMessage?.role,
        };
    }

    private readJsonl(filePath: string): PiLine[] {
        const content = safeReadFile(filePath);
        if (content === undefined) return [];

        const entries: PiLine[] = [];
        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    entries.push(parsed as PiLine);
                }
            } catch {
                continue;
            }
        }
        return entries;
    }

    private entryToMessage(entry: PiLine, includeSystem: boolean): ConversationMessage | null {
        const role = this.entryRole(entry);
        if (!role) return null;
        if (role === 'system' && !includeSystem) return null;

        const content = this.entryContent(entry).trim();
        if (!content) return null;

        return {
            role,
            content,
            timestamp: this.entryTimestamp(entry),
        };
    }

    private entryRole(entry: PiLine): ConversationMessage['role'] | null {
        const message = this.messageRecord(entry);
        const raw = this.firstString(
            entry.role,
            message?.role,
            this.roleLikeType(entry.type),
            entry.payload?.role,
            entry.payload?.type,
            entry.data?.role,
            entry.data?.type,
        );
        if (!raw) return null;
        const normalized = raw.toLowerCase();
        if (normalized === 'user' || normalized === 'human') return 'user';
        if (normalized === 'assistant' || normalized === 'ai' || normalized === 'pi') return 'assistant';
        if (normalized === 'system') return 'system';
        return null;
    }

    private entryContent(entry: PiLine): string {
        const message = this.messageRecord(entry);
        const candidates = [
            entry.content,
            entry.text,
            message?.content,
            message?.text,
            message?.message,
            entry.message,
            entry.payload?.content,
            entry.payload?.text,
            entry.payload?.message,
            entry.data?.content,
            entry.data?.text,
            entry.data?.message,
        ];

        for (const candidate of candidates) {
            const text = this.contentToString(candidate);
            if (text) return text;
        }
        return '';
    }

    private contentToString(value: unknown): string {
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) {
            return value.map((item) => this.contentToString(item)).filter(Boolean).join('');
        }
        if (!value || typeof value !== 'object') return '';

        const record = value as Record<string, unknown>;
        return this.contentToString(record.content ?? record.text ?? record.value);
    }

    private asRecord(value: unknown): PiRecord | null {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        return value as PiRecord;
    }

    private messageRecord(entry: PiLine): PiRecord | null {
        return this.asRecord(entry.message);
    }

    private roleLikeType(value: unknown): string | undefined {
        if (typeof value !== 'string') return undefined;
        const normalized = value.toLowerCase();
        if (['user', 'human', 'assistant', 'ai', 'pi', 'system'].includes(normalized)) {
            return value;
        }
        return undefined;
    }

    private entryTimestamp(entry: PiLine): string | undefined {
        return this.firstString(
            entry.timestamp,
            entry.payload?.timestamp,
            entry.data?.timestamp,
            entry.createdAt,
            entry.created_at,
        );
    }

    private sessionIdFromEntries(entries: PiLine[]): string | null {
        for (const entry of entries) {
            const sessionId = this.firstString(
                entry.sessionId,
                entry.session_id,
                entry.id,
                entry.payload?.sessionId,
                entry.payload?.session_id,
                entry.payload?.id,
                entry.data?.sessionId,
                entry.data?.session_id,
                entry.data?.id,
            );
            if (sessionId) return sessionId;
        }
        return null;
    }

    private cwdFromEntries(entries: PiLine[]): string {
        for (const entry of entries) {
            const cwd = this.firstString(
                entry.cwd,
                entry.projectPath,
                entry.project_path,
                entry.payload?.cwd,
                entry.payload?.projectPath,
                entry.payload?.project_path,
                entry.data?.cwd,
                entry.data?.projectPath,
                entry.data?.project_path,
            );
            if (cwd) return cwd;
        }
        return '';
    }

    private sessionIdFromFile(filePath: string): string {
        const base = path.basename(filePath, '.jsonl');
        const underscore = base.lastIndexOf('_');
        return underscore >= 0 ? base.slice(underscore + 1) : base;
    }

    private encodeProjectDir(cwd: string): string {
        const normalized = path.resolve(cwd);
        return `--${normalized.replace(/^\//, '').replace(/\//g, '-')}--`;
    }

    private firstString(...values: unknown[]): string | undefined {
        for (const value of values) {
            if (typeof value === 'string' && value) return value;
        }
        return undefined;
    }

    private parseTimestamp(value?: string): Date | null {
        if (!value) return null;
        const timestamp = new Date(value);
        return Number.isNaN(timestamp.getTime()) ? null : timestamp;
    }

    private mapSessionToAgent(session: PiSession, processInfo: ProcessInfo, filePath: string): AgentInfo {
        const projectPath = session.projectPath || processInfo.cwd || '';
        return {
            name: generateAgentName(projectPath, processInfo.pid),
            type: this.type,
            status: this.determineStatus(session),
            summary: session.summary || 'Pi session active',
            pid: processInfo.pid,
            projectPath,
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
            summary: 'Pi process running',
            pid: processInfo.pid,
            projectPath: processInfo.cwd || '',
            sessionId: `pid-${processInfo.pid}`,
            lastActive: new Date(),
        };
    }

    private determineStatus(session: PiSession): AgentStatus {
        const diffMs = Date.now() - session.lastActive.getTime();
        const diffMinutes = diffMs / 60000;

        if (diffMinutes > PiAdapter.IDLE_THRESHOLD_MINUTES) return AgentStatus.IDLE;
        if (session.lastRole === 'assistant') return AgentStatus.WAITING;
        return AgentStatus.RUNNING;
    }

    private truncate(value: string, maxLength: number): string {
        if (value.length <= maxLength) return value;
        return `${value.slice(0, maxLength - 3)}...`;
    }

    private isPiExecutable(command: string): boolean {
        for (const token of command.trim().split(/\s+/)) {
            const base = path.basename(token).toLowerCase();
            if (base === 'pi' || base === 'pi.exe' || base === 'pi.js') return true;
        }
        return false;
    }

    getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
        const includeSystem = options?.verbose ?? false;
        return this.entriesToMessages(this.readJsonl(sessionFilePath), includeSystem);
    }

    private entriesToMessages(entries: PiLine[], includeSystem: boolean): ConversationMessage[] {
        return entries
            .map((entry) => this.entryToMessage(entry, includeSystem))
            .filter((msg): msg is ConversationMessage => msg !== null);
    }

    async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
        if (!isDirectory(this.piSessionsDir)) return [];

        const summaries: SessionSummary[] = [];
        for (const filePath of this.collectJsonlFiles(this.piSessionsDir)) {
            const summary = this.fileToSessionSummary(filePath);
            if (!summary) continue;
            if (opts?.cwd !== undefined && summary.cwd !== opts.cwd) continue;
            summaries.push(summary);
        }
        return summaries;
    }

    private fileToSessionSummary(filePath: string): SessionSummary | null {
        const entries = this.readJsonl(filePath);
        if (entries.length === 0) return null;

        const session = this.sessionFromEntries(entries, filePath);
        const firstUserMessage = this.entriesToMessages(entries, false)
            .find((msg) => msg.role === 'user')?.content ?? '';
        return {
            type: this.type,
            sessionId: session.sessionId,
            cwd: session.projectPath,
            firstUserMessage,
            lastActive: session.lastActive,
            startedAt: session.sessionStart,
            sessionFilePath: filePath,
        };
    }
}
