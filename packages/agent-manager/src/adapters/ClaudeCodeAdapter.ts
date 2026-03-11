import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { AgentAdapter, AgentInfo, ProcessInfo } from './AgentAdapter';
import { AgentStatus } from './AgentAdapter';
import { listProcesses } from '../utils/process';
import { readJson } from '../utils/file';

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
        content?: string | Array<{
            type?: string;
            text?: string;
            content?: string;
        }>;
    };
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
    lastUserMessage?: string;
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
 * 5. Extracting summary from last user message in session JSONL
 */
export class ClaudeCodeAdapter implements AgentAdapter {
    readonly type = 'claude' as const;

    /** Limit session parsing per run to keep list latency bounded. */
    private static readonly MIN_SESSION_SCAN = 12;
    private static readonly MAX_SESSION_SCAN = 40;
    private static readonly SESSION_SCAN_MULTIPLIER = 4;
    /** Matching tolerance between process start time and session start time. */
    private static readonly PROCESS_SESSION_TIME_TOLERANCE_MS = 2 * 60 * 1000;

    private projectsDir: string;

    constructor() {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.projectsDir = path.join(homeDir, '.claude', 'projects');
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

        if (sessions.length === 0) {
            return claudeProcesses.map((p) =>
                this.mapProcessOnlyAgent(p, []),
            );
        }

        const sortedSessions = [...sessions].sort(
            (a, b) => b.lastActive.getTime() - a.lastActive.getTime(),
        );
        const usedSessionIds = new Set<string>();
        const assignedPids = new Set<number>();
        const agents: AgentInfo[] = [];

        const modes: SessionMatchMode[] = ['cwd', 'missing-cwd', 'parent-child'];
        for (const mode of modes) {
            this.assignSessionsForMode(
                mode,
                claudeProcesses,
                sortedSessions,
                usedSessionIds,
                assignedPids,
                processStartByPid,
                agents,
            );
        }

        for (const processInfo of claudeProcesses) {
            if (assignedPids.has(processInfo.pid)) {
                continue;
            }

            assignedPids.add(processInfo.pid);
            agents.push(this.mapProcessOnlyAgent(processInfo, agents));
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

            usedSessionIds.add(session.sessionId);
            assignedPids.add(processInfo.pid);
            agents.push(this.mapSessionToAgent(session, processInfo, agents));
        }
    }

    private mapSessionToAgent(
        session: ClaudeSession,
        processInfo: ProcessInfo,
        existingAgents: AgentInfo[],
    ): AgentInfo {
        return {
            name: this.generateAgentName(session, existingAgents),
            type: this.type,
            status: this.determineStatus(session),
            summary: session.lastUserMessage || 'Session started',
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
    ): AgentInfo {
        const processCwd = processInfo.cwd || '';
        const projectName = path.basename(processCwd) || 'claude';
        const hasDuplicate = existingAgents.some((a) => a.projectPath === processCwd);

        return {
            name: hasDuplicate ? `${projectName} (pid-${processInfo.pid})` : projectName,
            type: this.type,
            status: AgentStatus.IDLE,
            summary: 'Unknown',
            pid: processInfo.pid,
            projectPath: processCwd,
            sessionId: `pid-${processInfo.pid}`,
            lastActive: new Date(),
        };
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

        const best = this.rankCandidatesByStartTime(candidates, processStart)[0];
        if (!best) {
            return undefined;
        }

        // In early modes (cwd/missing-cwd), defer assignment when the best
        // candidate is outside start-time tolerance — a closer match may
        // exist in parent-child mode (e.g., worktree sessions).
        if (mode !== 'parent-child') {
            const diffMs = Math.abs(
                best.sessionStart.getTime() - processStart.getTime(),
            );
            if (diffMs > ClaudeCodeAdapter.PROCESS_SESSION_TIME_TOLERANCE_MS) {
                return undefined;
            }
        }

        return best;
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

            // parent-child mode: match if process CWD equals, is under, or is
            // a parent of session project/lastCwd.  This also catches exact CWD
            // matches that were deferred from `cwd` mode due to start-time tolerance.
            return (
                this.pathRelated(processInfo.cwd, session.projectPath) ||
                this.pathRelated(processInfo.cwd, session.lastCwd)
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
                // Within tolerance (rank 0): prefer most recently active session.
                // The exact diff is noise — a 6s vs 45s difference is meaningless,
                // but the session with recent activity is more likely the real one.
                if (a.rank === 0) return b.recency - a.recency;
                // Outside tolerance: prefer smallest time difference, then recency.
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

        // Ensure breadth: include at least the most recent session per project,
        // then fill remaining slots with globally most-recent sessions.
        const sorted = files.sort((a, b) => b.mtimeMs - a.mtimeMs);
        const result: typeof files = [];
        const seenProjects = new Set<string>();

        // First pass: one most-recent session per project directory
        for (const file of sorted) {
            const projDir = path.dirname(file.filePath);
            if (!seenProjects.has(projDir)) {
                seenProjects.add(projDir);
                result.push(file);
            }
        }

        // Second pass: fill remaining slots with globally most-recent
        if (result.length < limit) {
            const resultSet = new Set(result.map((f) => f.filePath));
            for (const file of sorted) {
                if (result.length >= limit) break;
                if (!resultSet.has(file.filePath)) {
                    result.push(file);
                }
            }
        }

        return result.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
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

        // Parse first line for sessionStart.
        // Claude Code may emit a "file-history-snapshot" as the first entry, which
        // stores its timestamp inside "snapshot.timestamp" rather than at the root.
        let sessionStart: Date | null = null;
        try {
            const firstEntry = JSON.parse(allLines[0]);
            const rawTs: string | undefined =
                firstEntry.timestamp || firstEntry.snapshot?.timestamp;
            if (rawTs) {
                const ts = new Date(rawTs);
                if (!Number.isNaN(ts.getTime())) {
                    sessionStart = ts;
                }
            }
        } catch {
            /* skip */
        }

        // Parse all lines for session state (file already in memory)
        let slug: string | undefined;
        let lastEntryType: string | undefined;
        let lastActive: Date | undefined;
        let lastCwd: string | undefined;
        let isInterrupted = false;
        let lastUserMessage: string | undefined;

        for (const line of allLines) {
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

                if (entry.type && !this.isMetadataEntryType(entry.type)) {
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

                        // Extract user message text for summary fallback
                        const text = this.extractUserMessageText(msgContent);
                        if (text) {
                            lastUserMessage = text;
                        }
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
            lastUserMessage,
        };
    }

    /**
     * Determine agent status from session state
     */
    private determineStatus(session: ClaudeSession): AgentStatus {
        if (!session.lastEntryType) {
            return AgentStatus.UNKNOWN;
        }

        // No age-based IDLE override: every agent in the list is backed by
        // a running process (found via ps), so the entry type is the best
        // indicator of actual state.

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

    /** Check if two paths are equal, or one is a parent/child of the other. */
    private pathRelated(a?: string, b?: string): boolean {
        return this.pathEquals(a, b) || this.isChildPath(a, b) || this.isChildPath(b, a);
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

    /**
     * Extract meaningful text from a user message content.
     * Handles string and array formats, skill command expansion, and noise filtering.
     */
    private extractUserMessageText(
        content: string | Array<{ type?: string; text?: string }> | undefined,
    ): string | undefined {
        if (!content) {
            return undefined;
        }

        let raw: string | undefined;

        if (typeof content === 'string') {
            raw = content.trim();
        } else if (Array.isArray(content)) {
            for (const block of content) {
                if (block.type === 'text' && block.text?.trim()) {
                    raw = block.text.trim();
                    break;
                }
            }
        }

        if (!raw) {
            return undefined;
        }

        // Skill slash-command: extract /command-name and args
        if (raw.startsWith('<command-message>')) {
            return this.parseCommandMessage(raw);
        }

        // Expanded skill content: extract ARGUMENTS line if present, skip otherwise
        if (raw.startsWith('Base directory for this skill:')) {
            const argsMatch = raw.match(/\nARGUMENTS:\s*(.+)/);
            return argsMatch?.[1]?.trim() || undefined;
        }

        // Filter noise
        if (this.isNoiseMessage(raw)) {
            return undefined;
        }

        return raw;
    }

    /**
     * Parse a <command-message> string into "/command args" format.
     */
    private parseCommandMessage(raw: string): string | undefined {
        const nameMatch = raw.match(/<command-name>([^<]+)<\/command-name>/);
        const argsMatch = raw.match(/<command-args>([^<]+)<\/command-args>/);
        const name = nameMatch?.[1]?.trim();
        if (!name) {
            return undefined;
        }
        const args = argsMatch?.[1]?.trim();
        return args ? `${name} ${args}` : name;
    }

    /**
     * Check if a message is noise (not a meaningful user intent).
     */
    private isNoiseMessage(text: string): boolean {
        return (
            text.startsWith('[Request interrupted') ||
            text === 'Tool loaded.' ||
            text.startsWith('This session is being continued')
        );
    }

    /**
     * Check if an entry type is metadata (not conversation state).
     * These should not overwrite lastEntryType used for status determination.
     */
    private isMetadataEntryType(type: string): boolean {
        return type === 'last-prompt' || type === 'file-history-snapshot';
    }

    private normalizePath(value: string): string {
        const resolved = path.resolve(value);
        if (resolved.length > 1 && resolved.endsWith(path.sep)) {
            return resolved.slice(0, -1);
        }
        return resolved;
    }
}
