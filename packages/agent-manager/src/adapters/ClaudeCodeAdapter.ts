/**
 * Claude Code Adapter
 *
 * Detects running Claude Code agents by combining:
 * 1. Running `claude` processes
 * 2. Session metadata under ~/.claude/projects
 * 3. History entries from ~/.claude/history.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { AgentAdapter, AgentInfo, ProcessInfo } from './AgentAdapter';
import { AgentStatus } from './AgentAdapter';
import { listProcesses } from '../utils/process';
import { readJsonLines, readJson } from '../utils/file';

/**
 * Structure of ~/.claude/projects/{path}/sessions-index.json
 */
interface SessionsIndex {
    originalPath: string;
}

/**
 * Entry in session JSONL file
 */
interface SessionEntry {
    type?: string;
    timestamp?: string;
    slug?: string;
    cwd?: string;
    message?: {
        content?: Array<{
            type?: string;
            text?: string;
            content?: string;
        }>;
    };
}

/**
 * Entry in ~/.claude/history.jsonl
 */
interface HistoryEntry {
    display: string;
    timestamp: number;
    project: string;
    sessionId: string;
}

/**
 * Claude Code session information
 */
interface ClaudeSession {
    sessionId: string;
    projectPath: string;
    lastCwd?: string;
    slug?: string;
    sessionStart: Date;
    lastActive: Date;
    lastEntryType?: string;
    isInterrupted: boolean;
}

type SessionMatchMode = 'cwd' | 'missing-cwd' | 'parent-child';

/**
 * Claude Code Adapter
 *
 * Detects Claude Code agents by:
 * 1. Finding running claude processes
 * 2. Getting process start times for accurate session matching
 * 3. Reading bounded session files from ~/.claude/projects/
 * 4. Matching sessions to processes via CWD then start time ranking
 * 5. Extracting summary from history.jsonl
 */
export class ClaudeCodeAdapter implements AgentAdapter {
    readonly type = 'claude' as const;

    /** Keep status thresholds aligned across adapters. */
    private static readonly IDLE_THRESHOLD_MINUTES = 5;
    /** Limit session parsing per run to keep list latency bounded. */
    private static readonly MIN_SESSION_SCAN = 12;
    private static readonly MAX_SESSION_SCAN = 40;
    private static readonly SESSION_SCAN_MULTIPLIER = 4;
    /** Matching tolerance between process start time and session start time. */
    private static readonly PROCESS_SESSION_TIME_TOLERANCE_MS = 2 * 60 * 1000;

    private claudeDir: string;
    private projectsDir: string;
    private historyPath: string;

    constructor() {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.claudeDir = path.join(homeDir, '.claude');
        this.projectsDir = path.join(this.claudeDir, 'projects');
        this.historyPath = path.join(this.claudeDir, 'history.jsonl');
    }

    /**
     * Check if this adapter can handle a given process
     */
    canHandle(processInfo: ProcessInfo): boolean {
        return this.isClaudeExecutable(processInfo.command);
    }

    private isClaudeExecutable(command: string): boolean {
        const executable = command.trim().split(/\s+/)[0] || '';
        const base = path.basename(executable).toLowerCase();
        return base === 'claude' || base === 'claude.exe';
    }

    /**
     * Detect running Claude Code agents
     */
    async detectAgents(): Promise<AgentInfo[]> {
        const claudeProcesses = this.listClaudeProcesses();
        if (claudeProcesses.length === 0) {
            return [];
        }

        const processStartByPid = this.getProcessStartTimes(
            claudeProcesses.map((p) => p.pid),
        );
        const sessionScanLimit = this.calculateSessionScanLimit(claudeProcesses.length);
        const sessions = this.readSessions(sessionScanLimit);
        const history = this.readHistory();
        const historyBySessionId = new Map<string, HistoryEntry>();
        for (const entry of history) {
            historyBySessionId.set(entry.sessionId, entry);
        }

        if (sessions.length === 0) {
            return claudeProcesses.map((p) =>
                this.mapProcessOnlyAgent(p, [], history),
            );
        }

        const sortedSessions = [...sessions].sort(
            (a, b) => b.lastActive.getTime() - a.lastActive.getTime(),
        );
        const usedSessionIds = new Set<string>();
        const assignedPids = new Set<number>();
        const agents: AgentInfo[] = [];

        this.assignSessionsForMode(
            'cwd',
            claudeProcesses,
            sortedSessions,
            usedSessionIds,
            assignedPids,
            processStartByPid,
            historyBySessionId,
            agents,
        );
        this.assignSessionsForMode(
            'missing-cwd',
            claudeProcesses,
            sortedSessions,
            usedSessionIds,
            assignedPids,
            processStartByPid,
            historyBySessionId,
            agents,
        );
        this.assignSessionsForMode(
            'parent-child',
            claudeProcesses,
            sortedSessions,
            usedSessionIds,
            assignedPids,
            processStartByPid,
            historyBySessionId,
            agents,
        );

        for (const processInfo of claudeProcesses) {
            if (assignedPids.has(processInfo.pid)) {
                continue;
            }

            this.addProcessOnlyAgent(processInfo, assignedPids, agents, history);
        }

        return agents;
    }

    private listClaudeProcesses(): ProcessInfo[] {
        return listProcesses({ namePattern: 'claude' }).filter((p) =>
            this.canHandle(p),
        );
    }

    private calculateSessionScanLimit(processCount: number): number {
        return Math.min(
            Math.max(
                processCount * ClaudeCodeAdapter.SESSION_SCAN_MULTIPLIER,
                ClaudeCodeAdapter.MIN_SESSION_SCAN,
            ),
            ClaudeCodeAdapter.MAX_SESSION_SCAN,
        );
    }

    private assignSessionsForMode(
        mode: SessionMatchMode,
        claudeProcesses: ProcessInfo[],
        sessions: ClaudeSession[],
        usedSessionIds: Set<string>,
        assignedPids: Set<number>,
        processStartByPid: Map<number, Date>,
        historyBySessionId: Map<string, HistoryEntry>,
        agents: AgentInfo[],
    ): void {
        for (const processInfo of claudeProcesses) {
            if (assignedPids.has(processInfo.pid)) {
                continue;
            }

            const session = this.selectBestSession(
                processInfo,
                sessions,
                usedSessionIds,
                processStartByPid,
                mode,
            );
            if (!session) {
                continue;
            }

            this.addMappedSessionAgent(
                session,
                processInfo,
                usedSessionIds,
                assignedPids,
                historyBySessionId,
                agents,
            );
        }
    }

    private addMappedSessionAgent(
        session: ClaudeSession,
        processInfo: ProcessInfo,
        usedSessionIds: Set<string>,
        assignedPids: Set<number>,
        historyBySessionId: Map<string, HistoryEntry>,
        agents: AgentInfo[],
    ): void {
        usedSessionIds.add(session.sessionId);
        assignedPids.add(processInfo.pid);
        agents.push(this.mapSessionToAgent(session, processInfo, historyBySessionId, agents));
    }

    private addProcessOnlyAgent(
        processInfo: ProcessInfo,
        assignedPids: Set<number>,
        agents: AgentInfo[],
        history: HistoryEntry[],
    ): void {
        assignedPids.add(processInfo.pid);
        agents.push(this.mapProcessOnlyAgent(processInfo, agents, history));
    }

    private mapSessionToAgent(
        session: ClaudeSession,
        processInfo: ProcessInfo,
        historyBySessionId: Map<string, HistoryEntry>,
        existingAgents: AgentInfo[],
    ): AgentInfo {
        const historyEntry = historyBySessionId.get(session.sessionId);

        return {
            name: this.generateAgentName(session, existingAgents),
            type: this.type,
            status: this.determineStatus(session),
            summary: historyEntry?.display || 'Session started',
            pid: processInfo.pid,
            projectPath: session.projectPath || processInfo.cwd || '',
            sessionId: session.sessionId,
            slug: session.slug,
            lastActive: session.lastActive,
        };
    }

    private mapProcessOnlyAgent(
        processInfo: ProcessInfo,
        existingAgents: AgentInfo[],
        history: HistoryEntry[],
    ): AgentInfo {
        const processCwd = processInfo.cwd || '';
        const historyEntry = this.findHistoryForCwd(processCwd, history);
        const sessionId = historyEntry?.sessionId || `pid-${processInfo.pid}`;
        const lastActive = historyEntry ? new Date(historyEntry.timestamp) : new Date();

        const syntheticSession: ClaudeSession = {
            sessionId,
            projectPath: processCwd,
            lastCwd: processCwd,
            sessionStart: lastActive,
            lastActive,
            isInterrupted: false,
        };

        return {
            name: this.generateAgentName(syntheticSession, existingAgents),
            type: this.type,
            status: AgentStatus.RUNNING,
            summary: historyEntry?.display || 'Claude process running',
            pid: processInfo.pid,
            projectPath: processCwd,
            sessionId,
            lastActive,
        };
    }

    private findHistoryForCwd(
        cwd: string,
        history: HistoryEntry[],
    ): HistoryEntry | undefined {
        if (!cwd) {
            return undefined;
        }

        const normalizedCwd = this.normalizePath(cwd);
        return history.find(
            (entry) => this.normalizePath(entry.project) === normalizedCwd,
        );
    }

    private selectBestSession(
        processInfo: ProcessInfo,
        sessions: ClaudeSession[],
        usedSessionIds: Set<string>,
        processStartByPid: Map<number, Date>,
        mode: SessionMatchMode,
    ): ClaudeSession | undefined {
        const candidates = this.filterCandidateSessions(
            processInfo,
            sessions,
            usedSessionIds,
            mode,
        );

        if (candidates.length === 0) {
            return undefined;
        }

        const processStart = processStartByPid.get(processInfo.pid);
        if (!processStart) {
            return candidates.sort(
                (a, b) => b.lastActive.getTime() - a.lastActive.getTime(),
            )[0];
        }

        return this.rankCandidatesByStartTime(candidates, processStart)[0];
    }

    private filterCandidateSessions(
        processInfo: ProcessInfo,
        sessions: ClaudeSession[],
        usedSessionIds: Set<string>,
        mode: SessionMatchMode,
    ): ClaudeSession[] {
        return sessions.filter((session) => {
            if (usedSessionIds.has(session.sessionId)) {
                return false;
            }

            if (mode === 'cwd') {
                return (
                    this.pathEquals(processInfo.cwd, session.projectPath) ||
                    this.pathEquals(processInfo.cwd, session.lastCwd)
                );
            }

            if (mode === 'missing-cwd') {
                return !session.projectPath;
            }

            // parent-child mode: match if process CWD is under session project or vice versa
            return (
                this.isChildPath(processInfo.cwd, session.projectPath) ||
                this.isChildPath(processInfo.cwd, session.lastCwd) ||
                this.isChildPath(session.projectPath, processInfo.cwd) ||
                this.isChildPath(session.lastCwd, processInfo.cwd)
            );
        });
    }

    private rankCandidatesByStartTime(
        candidates: ClaudeSession[],
        processStart: Date,
    ): ClaudeSession[] {
        const toleranceMs = ClaudeCodeAdapter.PROCESS_SESSION_TIME_TOLERANCE_MS;

        return candidates
            .map((session) => {
                const diffMs = Math.abs(
                    session.sessionStart.getTime() - processStart.getTime(),
                );
                const outsideTolerance = diffMs > toleranceMs ? 1 : 0;
                return {
                    session,
                    rank: outsideTolerance,
                    diffMs,
                    recency: session.lastActive.getTime(),
                };
            })
            .sort((a, b) => {
                if (a.rank !== b.rank) return a.rank - b.rank;
                if (a.diffMs !== b.diffMs) return a.diffMs - b.diffMs;
                return b.recency - a.recency;
            })
            .map((ranked) => ranked.session);
    }

    private getProcessStartTimes(pids: number[]): Map<number, Date> {
        if (pids.length === 0 || process.env.JEST_WORKER_ID) {
            return new Map();
        }

        try {
            const output = execSync(
                `ps -o pid=,etime= -p ${pids.join(',')}`,
                { encoding: 'utf-8' },
            );
            const nowMs = Date.now();
            const startTimes = new Map<number, Date>();

            for (const rawLine of output.split('\n')) {
                const line = rawLine.trim();
                if (!line) continue;

                const parts = line.split(/\s+/);
                if (parts.length < 2) continue;

                const pid = Number.parseInt(parts[0], 10);
                const elapsedSeconds = this.parseElapsedSeconds(parts[1]);
                if (!Number.isFinite(pid) || elapsedSeconds === null) continue;

                startTimes.set(pid, new Date(nowMs - elapsedSeconds * 1000));
            }

            return startTimes;
        } catch {
            return new Map();
        }
    }

    private parseElapsedSeconds(etime: string): number | null {
        const match = etime
            .trim()
            .match(/^(?:(\d+)-)?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
        if (!match) {
            return null;
        }

        const days = Number.parseInt(match[1] || '0', 10);
        const hours = Number.parseInt(match[2] || '0', 10);
        const minutes = Number.parseInt(match[3] || '0', 10);
        const seconds = Number.parseInt(match[4] || '0', 10);

        return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
    }

    /**
     * Read Claude Code sessions with bounded scanning
     */
    private readSessions(limit: number): ClaudeSession[] {
        const sessionFiles = this.findSessionFiles(limit);
        const sessions: ClaudeSession[] = [];

        for (const file of sessionFiles) {
            try {
                const session = this.readSession(file.filePath, file.projectPath);
                if (session) {
                    sessions.push(session);
                }
            } catch (error) {
                console.error(`Failed to parse Claude session ${file.filePath}:`, error);
            }
        }

        return sessions;
    }

    /**
     * Find session files bounded by mtime, sorted most-recent first
     */
    private findSessionFiles(
        limit: number,
    ): Array<{ filePath: string; projectPath: string; mtimeMs: number }> {
        if (!fs.existsSync(this.projectsDir)) {
            return [];
        }

        const files: Array<{
            filePath: string;
            projectPath: string;
            mtimeMs: number;
        }> = [];

        for (const dirName of fs.readdirSync(this.projectsDir)) {
            if (dirName.startsWith('.')) {
                continue;
            }

            const projectDir = path.join(this.projectsDir, dirName);
            try {
                if (!fs.statSync(projectDir).isDirectory()) continue;
            } catch {
                continue;
            }

            const indexPath = path.join(projectDir, 'sessions-index.json');
            const index = readJson<SessionsIndex>(indexPath);
            const projectPath = index?.originalPath || '';

            for (const entry of fs.readdirSync(projectDir)) {
                if (!entry.endsWith('.jsonl')) {
                    continue;
                }

                const filePath = path.join(projectDir, entry);
                try {
                    files.push({
                        filePath,
                        projectPath,
                        mtimeMs: fs.statSync(filePath).mtimeMs,
                    });
                } catch {
                    continue;
                }
            }
        }

        return files
            .sort((a, b) => b.mtimeMs - a.mtimeMs)
            .slice(0, limit);
    }

    /**
     * Parse a single session file into ClaudeSession
     */
    private readSession(
        filePath: string,
        projectPath: string,
    ): ClaudeSession | null {
        const sessionId = path.basename(filePath, '.jsonl');

        let content: string;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        } catch {
            return null;
        }

        const allLines = content.trim().split('\n');
        if (allLines.length === 0) {
            return null;
        }

        // Parse first line for sessionStart
        let sessionStart: Date | null = null;
        try {
            const firstEntry: SessionEntry = JSON.parse(allLines[0]);
            if (firstEntry.timestamp) {
                const ts = new Date(firstEntry.timestamp);
                if (!Number.isNaN(ts.getTime())) {
                    sessionStart = ts;
                }
            }
        } catch {
            /* skip */
        }

        // Parse last N lines for recent state
        const recentLines = allLines.slice(-100);
        let slug: string | undefined;
        let lastEntryType: string | undefined;
        let lastActive: Date | undefined;
        let lastCwd: string | undefined;
        let isInterrupted = false;

        for (const line of recentLines) {
            try {
                const entry: SessionEntry = JSON.parse(line);

                if (entry.timestamp) {
                    const ts = new Date(entry.timestamp);
                    if (!Number.isNaN(ts.getTime())) {
                        lastActive = ts;
                    }
                }

                if (entry.slug && !slug) {
                    slug = entry.slug;
                }

                if (typeof entry.cwd === 'string' && entry.cwd.trim().length > 0) {
                    lastCwd = entry.cwd;
                }

                if (entry.type) {
                    lastEntryType = entry.type;

                    if (entry.type === 'user') {
                        const msgContent = entry.message?.content;
                        isInterrupted =
                            Array.isArray(msgContent) &&
                            msgContent.some(
                                (c) =>
                                    (c.type === 'text' &&
                                        c.text?.includes('[Request interrupted')) ||
                                    (c.type === 'tool_result' &&
                                        c.content?.includes('[Request interrupted')),
                            );
                    } else {
                        isInterrupted = false;
                    }
                }
            } catch {
                continue;
            }
        }

        return {
            sessionId,
            projectPath: projectPath || lastCwd || '',
            lastCwd,
            slug,
            sessionStart: sessionStart || lastActive || new Date(),
            lastActive: lastActive || new Date(),
            lastEntryType,
            isInterrupted,
        };
    }

    /**
     * Read history.jsonl for summaries
     * Only reads last 100 lines for performance
     */
    private readHistory(): HistoryEntry[] {
        return readJsonLines<HistoryEntry>(this.historyPath, 100);
    }

    /**
     * Determine agent status from session state
     */
    private determineStatus(session: ClaudeSession): AgentStatus {
        if (!session.lastEntryType) {
            return AgentStatus.UNKNOWN;
        }

        const ageMinutes =
            (Date.now() - session.lastActive.getTime()) / 60000;
        if (ageMinutes > ClaudeCodeAdapter.IDLE_THRESHOLD_MINUTES) {
            return AgentStatus.IDLE;
        }

        if (session.lastEntryType === 'user') {
            return session.isInterrupted
                ? AgentStatus.WAITING
                : AgentStatus.RUNNING;
        }

        if (
            session.lastEntryType === 'progress' ||
            session.lastEntryType === 'thinking'
        ) {
            return AgentStatus.RUNNING;
        }

        if (session.lastEntryType === 'assistant') {
            return AgentStatus.WAITING;
        }

        if (session.lastEntryType === 'system') {
            return AgentStatus.IDLE;
        }

        return AgentStatus.UNKNOWN;
    }

    /**
     * Generate unique agent name
     * Uses project basename, appends slug if multiple sessions for same project
     */
    private generateAgentName(
        session: ClaudeSession,
        existingAgents: AgentInfo[],
    ): string {
        const projectName = path.basename(session.projectPath) || 'claude';

        const sameProjectAgents = existingAgents.filter(
            (a) => a.projectPath === session.projectPath,
        );

        if (sameProjectAgents.length === 0) {
            return projectName;
        }

        if (session.slug) {
            const slugPart = session.slug.includes('-')
                ? session.slug.split('-')[0]
                : session.slug.slice(0, 8);
            return `${projectName} (${slugPart})`;
        }

        return `${projectName} (${session.sessionId.slice(0, 8)})`;
    }

    private pathEquals(a?: string, b?: string): boolean {
        if (!a || !b) {
            return false;
        }

        return this.normalizePath(a) === this.normalizePath(b);
    }

    private isChildPath(child?: string, parent?: string): boolean {
        if (!child || !parent) {
            return false;
        }

        const normalizedChild = this.normalizePath(child);
        const normalizedParent = this.normalizePath(parent);
        return normalizedChild.startsWith(`${normalizedParent}${path.sep}`);
    }

    private normalizePath(value: string): string {
        const resolved = path.resolve(value);
        if (resolved.length > 1 && resolved.endsWith(path.sep)) {
            return resolved.slice(0, -1);
        }
        return resolved;
    }
}
