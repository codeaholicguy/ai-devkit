/**
 * Codex Adapter
 *
 * Detects running Codex agents by:
 * 1. Finding running codex processes via shared listAgentProcesses()
 * 2. Enriching with CWD and start times via shared enrichProcesses()
 * 3. Matching exact PID-to-session metadata from ~/.codex/ai-devkit/sessions.json
 * 4. Discovering session files from ~/.codex/sessions/YYYY/MM/DD/ via shared batchGetSessionFileBirthtimes()
 * 5. Setting resolvedCwd from session_meta first line
 * 6. Matching sessions to processes via shared matchProcessesToSessions()
 * 7. Extracting summary from last event entry in session JSONL
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
import { batchGetSessionFileBirthtimes, isDirectory, safeReadFile, safeReaddir, safeStat } from '../utils/session.js';
import type { SessionFile } from '../utils/session.js';
import { matchProcessesToSessions, generateAgentName } from '../utils/matching.js';
import { AgentRegistry } from '../utils/AgentRegistry.js';

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

interface DirectMatch {
    process: ProcessInfo;
    sessionFile: SessionFile;
}

interface DirectMatchResult {
    agents: AgentInfo[];
    failedProcesses: ProcessInfo[];
}

interface MappingMatch {
    process: ProcessInfo;
    filePath: string;
}

interface MappingMatchResult {
    agents: AgentInfo[];
    fallback: ProcessInfo[];
}

export class CodexAdapter implements AgentAdapter {
    readonly type = 'codex' as const;

    private static readonly IDLE_THRESHOLD_MINUTES = 5;
    /** Include session files around process start day to recover long-lived processes. */
    private static readonly PROCESS_START_DAY_WINDOW_DAYS = 1;

    private codexSessionsDir: string;
    private sessionMappingPath: string;
    private registry: AgentRegistry;

    constructor(registry: AgentRegistry = AgentRegistry.default()) {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.codexSessionsDir = path.join(homeDir, '.codex', 'sessions');
        this.sessionMappingPath = path.join(homeDir, '.codex', 'ai-devkit', 'sessions.json');
        this.registry = registry;
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

        const { cachedAgents, remaining } = this.tryRegistryCache(processes);
        if (remaining.length === 0) return cachedAgents;

        const mappingResult = this.mapSessionMappingMatches(remaining);
        const { direct, fallback } = this.tryResumeMatching(mappingResult.fallback);
        const directResult = this.mapDirectMatches(direct);
        const { sessions, contentCache } = this.discoverSessions(fallback);
        if (sessions.length === 0) {
            return [
                ...cachedAgents,
                ...mappingResult.agents,
                ...directResult.agents,
                ...directResult.failedProcesses.map((p) => this.mapProcessOnlyAgent(p)),
                ...fallback.map((p) => this.mapProcessOnlyAgent(p)),
            ];
        }

        const matches = matchProcessesToSessions(fallback, sessions);
        const matchedPids = new Set([
            ...directResult.agents.map((a) => a.pid),
            ...matches.map((m) => m.process.pid),
        ]);
        const agents: AgentInfo[] = [...directResult.agents];

        for (const match of matches) {
            const cachedContent = contentCache.get(match.session.filePath);
            const sessionData = this.parseSession(cachedContent, match.session.filePath);
            if (sessionData) {
                agents.push(this.mapSessionToAgent(sessionData, match.process, match.session.filePath));
            } else {
                matchedPids.delete(match.process.pid);
            }
        }

        for (const proc of fallback) {
            if (!matchedPids.has(proc.pid)) {
                agents.push(this.mapProcessOnlyAgent(proc));
            }
        }

        for (const proc of directResult.failedProcesses) {
            agents.push(this.mapProcessOnlyAgent(proc));
        }

        return [...cachedAgents, ...mappingResult.agents, ...agents];
    }

    private mapSessionMappingMatches(processes: ProcessInfo[]): MappingMatchResult {
        const { matches, fallback } = this.matchFromSessionMapping(processes);
        const agents: AgentInfo[] = [];

        for (const match of matches) {
            const sessionData = this.parseSession(undefined, match.filePath);
            if (sessionData) {
                agents.push(this.mapSessionToAgent(sessionData, match.process, match.filePath));
            } else {
                fallback.push(match.process);
            }
        }

        return { agents, fallback };
    }

    private matchFromSessionMapping(processes: ProcessInfo[]): {
        matches: MappingMatch[];
        fallback: ProcessInfo[];
    } {
        const mapping = this.readSessionMapping();
        if (mapping.size === 0) return { matches: [], fallback: processes };

        const matches: MappingMatch[] = [];
        const fallback: ProcessInfo[] = [];

        for (const proc of processes) {
            const filePath = mapping.get(proc.pid);
            if (!filePath || !this.isTrustedSessionPath(filePath) || !fs.existsSync(filePath)) {
                fallback.push(proc);
                continue;
            }

            matches.push({ process: proc, filePath });
        }

        return { matches, fallback };
    }

    private readSessionMapping(): Map<number, string> {
        const content = safeReadFile(this.sessionMappingPath);
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
            const pid = this.toPid(key);
            if (pid !== null && typeof value === 'string' && value) {
                map.set(pid, value);
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
        const resolvedRoot = path.resolve(this.codexSessionsDir);
        const resolvedPath = path.resolve(filePath);
        return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`);
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

            const content = safeReadFile(entry.sessionFilePath);
            const sessionData = this.parseSession(content, entry.sessionFilePath);
            if (!sessionData) {
                remaining.push(proc);
                continue;
            }

            cachedAgents.push(this.mapSessionToAgent(sessionData, proc, entry.sessionFilePath));
        }

        return { cachedAgents, remaining };
    }

    /**
     * Match processes via `codex resume <uuid>` in their command line.
     * Resumed sessions predate the process, so birth-time proximity cannot
     * reliably pair them with the running PID.
     */
    private tryResumeMatching(processes: ProcessInfo[]): {
        direct: DirectMatch[];
        fallback: ProcessInfo[];
    } {
        const direct: DirectMatch[] = [];
        const fallback: ProcessInfo[] = [];

        for (const proc of processes) {
            const sessionId = this.extractResumeSessionId(proc.command);
            if (!sessionId) {
                fallback.push(proc);
                continue;
            }

            const sessionFile = this.findSessionFileById(sessionId);
            if (!sessionFile) {
                fallback.push(proc);
                continue;
            }

            direct.push({ process: proc, sessionFile });
        }

        return { direct, fallback };
    }

    private extractResumeSessionId(command: string): string | null {
        const match = command.match(/(?:^|\s)resume\s+([0-9a-f-]{36})(?:\s|$)/i);
        return match?.[1] ?? null;
    }

    private findSessionFileById(sessionId: string): SessionFile | null {
        for (const filePath of this.getCandidateSessionFiles(sessionId)) {
            if (!path.basename(filePath).includes(sessionId)) continue;

            const content = safeReadFile(filePath);
            const firstLine = content?.split('\n')[0]?.trim();
            if (!firstLine) continue;

            try {
                const parsed = JSON.parse(firstLine) as CodexEventEntry;
                if (parsed.type !== 'session_meta' || parsed.payload?.id !== sessionId) {
                    continue;
                }

                const stat = safeStat(filePath);
                if (!stat) continue;
                const metaTimestampMs = this.parseMetaTimestampMs(parsed.payload?.timestamp);

                return {
                    sessionId,
                    filePath,
                    projectDir: path.dirname(filePath),
                    birthtimeMs: metaTimestampMs ?? stat.birthtimeMs,
                    resolvedCwd: parsed.payload?.cwd || '',
                };
            } catch {
                continue;
            }
        }

        return null;
    }

    private getCandidateSessionFiles(sessionId: string): string[] {
        // Codex currently writes UUIDv7 session IDs, so the ID can narrow lookup
        // to the creation-date directory. Fall back for older or changed formats.
        const sessionDate = this.tryParseUuidV7Date(sessionId);
        if (!sessionDate) return this.collectAllSessionFiles();

        return this.collectSessionFilesInDateDirs(
            this.getDateDirsAroundDate(sessionDate, CodexAdapter.PROCESS_START_DAY_WINDOW_DAYS),
        );
    }

    private mapDirectMatches(matches: DirectMatch[]): DirectMatchResult {
        const agents: AgentInfo[] = [];
        const failedProcesses: ProcessInfo[] = [];

        for (const match of matches) {
            const sessionData = this.parseSession(undefined, match.sessionFile.filePath);
            if (sessionData) {
                agents.push(this.mapSessionToAgent(sessionData, match.process, match.sessionFile.filePath));
            } else {
                failedProcesses.push(match.process);
            }
        }

        return { agents, failedProcesses };
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
                        const metaTimestampMs = this.parseMetaTimestampMs(parsed.payload?.timestamp);
                        if (metaTimestampMs !== null) {
                            file.birthtimeMs = metaTimestampMs;
                        }
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

    private getDateDirsAroundDate(date: Date, windowDays: number): string[] {
        const dirs: string[] = [];

        for (let offset = -windowDays; offset <= windowDays; offset++) {
            const day = new Date(date.getTime());
            day.setDate(day.getDate() + offset);
            const dayDir = path.join(this.codexSessionsDir, this.toSessionDayKey(day));
            if (isDirectory(dayDir)) {
                dirs.push(dayDir);
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

    private tryParseUuidV7Date(sessionId: string): Date | null {
        const match = sessionId.match(/^([0-9a-f]{8})-([0-9a-f]{4})-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        if (!match) return null;

        const timestampMs = Number.parseInt(`${match[1]}${match[2]}`, 16);
        if (!Number.isSafeInteger(timestampMs) || timestampMs <= 0) return null;

        const date = new Date(timestampMs);
        return Number.isNaN(date.getTime()) ? null : date;
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

    private parseMetaTimestampMs(value?: string): number | null {
        if (typeof value !== 'string') return null;

        const timestamp = this.parseTimestamp(value);
        if (!timestamp) return null;

        const timestampMs = timestamp.getTime();
        return Number.isFinite(timestampMs) ? timestampMs : null;
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

        const content = safeReadFile(sessionFilePath);
        if (content === undefined) return [];

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

    async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
        if (!isDirectory(this.codexSessionsDir)) return [];

        const files = this.collectAllSessionFiles();
        const summaries: SessionSummary[] = [];

        for (const filePath of files) {
            const summary = this.fileToSessionSummary(filePath);
            if (!summary) continue;
            if (opts?.cwd !== undefined && summary.cwd !== opts.cwd) continue;
            summaries.push(summary);
        }

        return summaries;
    }

    /**
     * Walk every YYYY/MM/DD directory under `codexSessionsDir` and return
     * absolute paths of `.jsonl` files. Tolerates malformed layouts
     * (skips entries that aren't directories at the expected depth).
     */
    private collectAllSessionFiles(): string[] {
        const out: string[] = [];

        for (const yearEntry of safeReaddir(this.codexSessionsDir)) {
            const yearDir = path.join(this.codexSessionsDir, yearEntry);
            if (!isDirectory(yearDir)) continue;

            for (const monthEntry of safeReaddir(yearDir)) {
                const monthDir = path.join(yearDir, monthEntry);
                if (!isDirectory(monthDir)) continue;

                for (const dayEntry of safeReaddir(monthDir)) {
                    const dayDir = path.join(monthDir, dayEntry);
                    if (!isDirectory(dayDir)) continue;

                    for (const fileEntry of safeReaddir(dayDir)) {
                        if (!fileEntry.endsWith('.jsonl')) continue;
                        out.push(path.join(dayDir, fileEntry));
                    }
                }
            }
        }

        return out;
    }

    private collectSessionFilesInDateDirs(dateDirs: string[]): string[] {
        const out: string[] = [];

        for (const dayDir of dateDirs) {
            for (const fileEntry of safeReaddir(dayDir)) {
                if (!fileEntry.endsWith('.jsonl')) continue;
                out.push(path.join(dayDir, fileEntry));
            }
        }

        return out;
    }

    /**
     * Read a Codex session JSONL file and produce a {@link SessionSummary}.
     * Returns null when the file is unreadable, has no `session_meta`, or
     * lacks a session id.
     */
    private fileToSessionSummary(filePath: string): SessionSummary | null {
        const content = safeReadFile(filePath);
        if (content === undefined) return null;

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

        let firstUserMessage = '';
        let lastTimestamp: Date | null = null;

        for (let i = 1; i < allLines.length; i++) {
            let entry: CodexEventEntry;
            try {
                entry = JSON.parse(allLines[i]);
            } catch {
                continue;
            }

            const ts = this.parseTimestamp(entry.timestamp);
            if (ts) lastTimestamp = ts;

            if (
                !firstUserMessage &&
                entry.payload?.type === 'user_message' &&
                typeof entry.payload.message === 'string' &&
                entry.payload.message.trim().length > 0
            ) {
                firstUserMessage = entry.payload.message.trim();
            }
        }

        const stat = safeStat(filePath);

        const startedAt =
            this.parseTimestamp(metaEntry.payload.timestamp) ||
            lastTimestamp ||
            stat?.birthtime ||
            stat?.mtime ||
            new Date();
        const lastActive = lastTimestamp || startedAt;

        return {
            type: 'codex',
            sessionId: metaEntry.payload.id,
            cwd: metaEntry.payload.cwd || '',
            firstUserMessage,
            lastActive,
            startedAt,
            sessionFilePath: filePath,
        };
    }
}
