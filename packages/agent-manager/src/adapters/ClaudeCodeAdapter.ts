import * as fs from 'fs';
import * as path from 'path';
import type { AgentAdapter, AgentInfo, ProcessInfo, ConversationMessage } from './AgentAdapter';
import { AgentStatus } from './AgentAdapter';
import { listAgentProcesses, enrichProcesses } from '../utils/process';
import { batchGetSessionFileBirthtimes } from '../utils/session';
import type { SessionFile } from '../utils/session';
import { matchProcessesToSessions, generateAgentName } from '../utils/matching';
import { ClaudeSessionParser } from '../utils/ClaudeSessionParser';
import type { ClaudeSession } from '../utils/ClaudeSessionParser';

/**
 * Entry in ~/.claude/sessions/<pid>.json written by Claude Code.
 * Maps a running process to its session file via PID.
 */
interface PidFileEntry {
    pid: number;
    sessionId: string;
    cwd: string;
    /** Epoch milliseconds when the Claude Code process started */
    startedAt: number;
    kind: string;
    entrypoint: string;
}

/**
 * A process directly matched to a session via PID file (authoritative path).
 */
interface DirectMatch {
    process: ProcessInfo;
    sessionFile: SessionFile;
}

/** Maximum allowed delta (ms) between process start time and PID file startedAt. */
const PID_FILE_STALENESS_MS = 60000;

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
    private parser: ClaudeSessionParser;

    constructor() {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.projectsDir = path.join(homeDir, '.claude', 'projects');
        this.sessionsDir = path.join(homeDir, '.claude', 'sessions');
        this.parser = new ClaudeSessionParser();
    }

    canHandle(processInfo: ProcessInfo): boolean {
        return this.isClaudeExecutable(processInfo.command);
    }

    private isClaudeExecutable(command: string): boolean {
        const executable = command.trim().split(/\s+/)[0] || '';
        const base = path.basename(executable).toLowerCase();
        return base === 'claude' || base === 'claude.exe';
    }

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
            const sessionData = this.parser.readSession(sessionFile.filePath, sessionFile.resolvedCwd);
            if (sessionData) {
                agents.push(this.mapSessionToAgent(sessionData, proc, sessionFile));
            } else {
                matchedPids.delete(proc.pid);
            }
        }

        // Build agents from legacy matches
        for (const match of legacyMatches) {
            const sessionData = this.parser.readSession(
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

        const files = batchGetSessionFileBirthtimes([...dirToCwd.keys()]);

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
     * stale startedAt (>60s from proc.startTime), or missing JSONL.
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
                    if (deltaMs > PID_FILE_STALENESS_MS) {
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
            status: this.parser.determineStatus(session),
            summary: session.lastUserMessage || 'Session started',
            pid: processInfo.pid,
            projectPath: sessionFile.resolvedCwd || processInfo.cwd || '',
            sessionId: sessionFile.sessionId,
            lastActive: session.lastActive,
            sessionFilePath: sessionFile.filePath,
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

    getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
        return this.parser.getConversation(sessionFilePath, options);
    }
}
