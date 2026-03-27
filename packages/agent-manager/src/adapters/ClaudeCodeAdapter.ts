import * as fs from 'fs';
import * as path from 'path';
import type { AgentAdapter, AgentInfo, ProcessInfo } from './AgentAdapter';
import { AgentStatus } from './AgentAdapter';
import { listAgentProcesses, enrichProcesses } from '../utils/process';
import { batchGetSessionFileBirthtimes } from '../utils/session';
import type { SessionFile } from '../utils/session';
import { matchProcessesToSessions, generateAgentName } from '../utils/matching';
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
 * Entry in ~/.claude/sessions/<pid>.json written by Claude Code
 */
interface PidFileEntry {
    pid: number;
    sessionId: string;
    cwd: string;
    startedAt: number; // epoch milliseconds
    kind: string;
    entrypoint: string;
}

/**
 * A process directly matched to a session via PID file (authoritative path)
 */
interface DirectMatch {
    process: ProcessInfo;
    sessionFile: SessionFile;
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

/**
 * Claude Code Adapter
 *
 * Detects Claude Code agents by:
 * 1. Finding running claude processes via shared listAgentProcesses()
 * 2. Enriching with CWD and start times via shared enrichProcesses()
 * 3. Attempting authoritative PID-file matching via ~/.claude/sessions/<pid>.json
 * 4. Falling back to CWD+birthtime heuristic (matchProcessesToSessions) for processes without a PID file
 * 5. Extracting summary from last user message in session JSONL
 */
export class ClaudeCodeAdapter implements AgentAdapter {
    readonly type = 'claude' as const;

    private projectsDir: string;
    private sessionsDir: string;

    constructor() {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.projectsDir = path.join(homeDir, '.claude', 'projects');
        this.sessionsDir = path.join(homeDir, '.claude', 'sessions');
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
        const processes = enrichProcesses(listAgentProcesses('claude'));
        if (processes.length === 0) {
            return [];
        }

        // Step 1: try authoritative PID-file matching for every process
        const { direct, fallback } = this.tryPidFileMatching(processes);

        // Step 2: run legacy CWD+birthtime matching only for processes without a PID file
        const legacySessions = this.discoverSessions(fallback);
        const legacyMatches =
            fallback.length > 0 && legacySessions.length > 0
                ? matchProcessesToSessions(fallback, legacySessions)
                : [];

        const matchedPids = new Set([
            ...direct.map((d) => d.process.pid),
            ...legacyMatches.map((m) => m.process.pid),
        ]);

        const agents: AgentInfo[] = [];

        // Build agents from direct (PID-file) matches
        for (const { process: proc, sessionFile } of direct) {
            const sessionData = this.readSession(sessionFile.filePath, sessionFile.resolvedCwd);
            if (sessionData) {
                agents.push(this.mapSessionToAgent(sessionData, proc, sessionFile));
            } else {
                matchedPids.delete(proc.pid);
            }
        }

        // Build agents from legacy matches
        for (const match of legacyMatches) {
            const sessionData = this.readSession(
                match.session.filePath,
                match.session.resolvedCwd,
            );
            if (sessionData) {
                agents.push(this.mapSessionToAgent(sessionData, match.process, match.session));
            } else {
                matchedPids.delete(match.process.pid);
            }
        }

        // Any process with no match (direct or legacy) appears as IDLE
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
     * For each unique process CWD, encodes it to derive the expected
     * ~/.claude/projects/<encoded>/ directory, then gets session file birthtimes
     * via a single batched stat call across all directories.
     */
    private discoverSessions(processes: ProcessInfo[]): SessionFile[] {
        // Collect valid project dirs and map them back to their CWD
        const dirToCwd = new Map<string, string>();

        for (const proc of processes) {
            if (!proc.cwd) continue;

            const projectDir = this.getProjectDir(proc.cwd);
            if (dirToCwd.has(projectDir)) continue;

            try {
                if (!fs.statSync(projectDir).isDirectory()) continue;
            } catch {
                continue;
            }

            dirToCwd.set(projectDir, proc.cwd);
        }

        if (dirToCwd.size === 0) return [];

        // Single batched stat call across all directories
        const files = batchGetSessionFileBirthtimes([...dirToCwd.keys()]);

        // Set resolvedCwd based on which project dir the file belongs to
        for (const file of files) {
            file.resolvedCwd = dirToCwd.get(file.projectDir) || '';
        }

        return files;
    }

    /**
     * Attempt to match each process to its session via ~/.claude/sessions/<pid>.json.
     *
     * Returns:
     *   direct  — processes matched authoritatively via PID file
     *   fallback — processes with no valid PID file (sent to legacy matching)
     *
     * Per-process fallback triggers on: file absent, malformed JSON,
     * stale startedAt (>60 s from proc.startTime), or missing JSONL.
     */
    private tryPidFileMatching(processes: ProcessInfo[]): {
        direct: DirectMatch[];
        fallback: ProcessInfo[];
    } {
        const direct: DirectMatch[] = [];
        const fallback: ProcessInfo[] = [];

        for (const proc of processes) {
            const pidFilePath = path.join(this.sessionsDir, `${proc.pid}.json`);
            try {
                const entry = JSON.parse(
                    fs.readFileSync(pidFilePath, 'utf-8'),
                ) as PidFileEntry;

                // Stale-file guard: reject PID files from a previous process with the same PID
                if (proc.startTime) {
                    const deltaMs = Math.abs(proc.startTime.getTime() - entry.startedAt);
                    if (deltaMs > 60000) {
                        fallback.push(proc);
                        continue;
                    }
                }

                const projectDir = this.getProjectDir(entry.cwd);
                const jsonlPath = path.join(projectDir, `${entry.sessionId}.jsonl`);

                if (!fs.existsSync(jsonlPath)) {
                    fallback.push(proc);
                    continue;
                }

                direct.push({
                    process: proc,
                    sessionFile: {
                        sessionId: entry.sessionId,
                        filePath: jsonlPath,
                        projectDir,
                        birthtimeMs: entry.startedAt,
                        resolvedCwd: entry.cwd,
                    },
                });
            } catch {
                // PID file absent, unreadable, or malformed — fall back per-process
                fallback.push(proc);
            }
        }

        return { direct, fallback };
    }

    /**
     * Derive the Claude Code project directory for a given CWD.
     *
     * Claude Code encodes paths by replacing '/' with '-':
     * /Users/foo/bar → ~/.claude/projects/-Users-foo-bar/
     */
    private getProjectDir(cwd: string): string {
        const encoded = cwd.replace(/\//g, '-');
        return path.join(this.projectsDir, encoded);
    }

    private mapSessionToAgent(
        session: ClaudeSession,
        processInfo: ProcessInfo,
        sessionFile: SessionFile,
    ): AgentInfo {
        return {
            name: generateAgentName(processInfo.cwd, processInfo.pid),
            type: this.type,
            status: this.determineStatus(session),
            summary: session.lastUserMessage || 'Session started',
            pid: processInfo.pid,
            projectPath: sessionFile.resolvedCwd || processInfo.cwd || '',
            sessionId: sessionFile.sessionId,
            slug: session.slug,
            lastActive: session.lastActive,
        };
    }

    private mapProcessOnlyAgent(processInfo: ProcessInfo): AgentInfo {
        return {
            name: generateAgentName(processInfo.cwd || '', processInfo.pid),
            type: this.type,
            status: AgentStatus.IDLE,
            summary: 'Unknown',
            pid: processInfo.pid,
            projectPath: processInfo.cwd || '',
            sessionId: `pid-${processInfo.pid}`,
            lastActive: new Date(),
        };
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

}
