import * as fs from 'fs';
import * as path from 'path';
import type { ProcessInfo } from '../../adapters/AgentAdapter.js';
import { AgentStatus } from '../../adapters/AgentAdapter.js';
import { matchProcessesToSessions, type MatchResult } from '../../utils/matching.js';
import {
    batchGetSessionFileBirthtimes,
    isDirectory,
    listJsonl,
    safeReaddir,
    safeStat,
    type SessionFile,
} from '../../utils/session.js';

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
    /**
     * Authoritative live status published by the Claude Code process
     * (e.g., 'running', 'waiting', 'idle'). Preferred over JSONL-derived
     * status because trailing entries like 'permission-mode' / 'ai-title'
     * can mask the real conversational state.
     */
    status?: string;
    /** Short description of what the agent is waiting on (e.g., "approve Read"). */
    waitingFor?: string;
}

/**
 * A process directly matched to a session via PID file (authoritative path).
 *
 * When the matching PID file also exposes live status/waitingFor metadata,
 * those values are carried here so the agent mapper can prefer them over
 * the JSONL-derived heuristic.
 */
export interface ClaudeDirectMatch {
    process: ProcessInfo;
    sessionFile: SessionFile;
    pidStatus?: AgentStatus;
    waitingFor?: string;
}

export interface ClaudeProcessSessionMatches {
    direct: ClaudeDirectMatch[];
    legacyMatches: MatchResult[];
}

export interface ClaudeSessionLocatorOptions {
    projectsDir?: string;
    sessionsDir?: string;
}

/** Maximum allowed delta (ms) between process start time and PID file startedAt. */
const PID_FILE_STALENESS_MS = 60000;

export class ClaudeSessionLocator {
    private readonly projectsDir: string;
    private readonly sessionsDir: string;

    constructor(options: ClaudeSessionLocatorOptions = {}) {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.projectsDir = options.projectsDir ?? path.join(homeDir, '.claude', 'projects');
        this.sessionsDir = options.sessionsDir ?? path.join(homeDir, '.claude', 'sessions');
    }

    /**
     * Pair live Claude processes with their session files.
     *
     * Runs three staged strategies, each handing its unmatched processes
     * to the next:
     * 1. `--resume <id>` on the command line — authoritative for resumed
     *    sessions whose JSONL predates the process.
     * 2. PID-file matching via ~/.claude/sessions/<pid>.json.
     * 3. Legacy CWD+birthtime heuristic, for processes with no PID file.
     */
    matchRunningProcesses(processes: ProcessInfo[]): ClaudeProcessSessionMatches {
        const { direct: resumeDirect, fallback: noResume } = this.tryResumeMatching(processes);
        const { direct: pidDirect, fallback } = this.tryPidFileMatching(noResume);
        const legacySessions = this.discoverLiveSessions(fallback);
        const legacyMatches =
            fallback.length > 0 && legacySessions.length > 0
                ? matchProcessesToSessions(fallback, legacySessions)
                : [];

        return {
            direct: [...resumeDirect, ...pidDirect],
            legacyMatches,
        };
    }

    /**
     * Discover candidate session files for listing historical sessions.
     *
     * Always walks every subdirectory of `projectsDir`. We can't use the
     * encoded-dir shortcut for the cwd-scoped path because Claude Code
     * indexes session files by where the *process was launched*, not by
     * the recorded `cwd` field inside the session — these diverge in
     * worktrees and similar setups. The cwd filter is applied later
     * against `session.lastCwd` so callers see exactly the sessions whose
     * recorded cwd matches.
     */
    discoverHistoricalSessionFiles(): Array<{ filePath: string; defaultCwd: string }> {
        const out: Array<{ filePath: string; defaultCwd: string }> = [];

        if (!isDirectory(this.projectsDir)) return out;

        for (const dirName of safeReaddir(this.projectsDir)) {
            const projectDir = path.join(this.projectsDir, dirName);
            if (!isDirectory(projectDir)) continue;

            // Best-effort decode for the rare case session content has no
            // recorded cwd: '-Users-foo-bar' → '/Users/foo/bar'. Lossy for
            // paths containing '-'; session content's lastCwd overrides
            // this when available.
            const decoded = dirName.replace(/-/g, '/');
            for (const name of listJsonl(projectDir)) {
                out.push({ filePath: path.join(projectDir, name), defaultCwd: decoded });
            }
        }

        return out;
    }

    /**
     * Derive the Claude Code project directory for a given CWD.
     *
     * Claude Code encodes paths by replacing every non-alphanumeric
     * character with '-', so '/', '_', '.', spaces, etc. all collapse:
     *   /Users/foo/bar          → -Users-foo-bar
     *   /Users/foo/my_project   → -Users-foo-my-project
     *   /Users/foo/.worktrees/x → -Users-foo--worktrees-x
     *
     * The encoding is lossy — multiple real paths can collide on the
     * same encoded dir. Callers that need to disambiguate must read the
     * `cwd` field inside each session JSONL.
     */
    private getProjectDir(cwd: string): string {
        const encoded = cwd.replace(/[^a-zA-Z0-9]/g, '-');
        return path.join(this.projectsDir, encoded);
    }

    /**
     * Discover session files for the given processes.
     *
     * For each unique process CWD, encodes it to derive the expected
     * ~/.claude/projects/<encoded>/ directory, then gets session file birthtimes
     * via a single batched stat call across all directories.
     */
    discoverLiveSessions(processes: ProcessInfo[]): SessionFile[] {
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
     * Match processes via `claude --resume <uuid>` in their command line.
     * This works for resumed sessions, where the JSONL was created earlier
     * (so its birthtime is far from the process startTime and the legacy
     * matcher can't pair them) and the PID file may also be misaligned.
     */
    private tryResumeMatching(processes: ProcessInfo[]): {
        direct: ClaudeDirectMatch[];
        fallback: ProcessInfo[];
    } {
        const direct: ClaudeDirectMatch[] = [];
        const fallback: ProcessInfo[] = [];

        for (const proc of processes) {
            const sessionId = this.extractResumeSessionId(proc.command);
            if (!sessionId || !proc.cwd) {
                fallback.push(proc);
                continue;
            }

            const projectDir = this.getProjectDir(proc.cwd);
            const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);

            const stat = safeStat(jsonlPath);
            if (!stat) {
                fallback.push(proc);
                continue;
            }

            // Best-effort: the PID file (if present for this proc) is the
            // authoritative source of live status. We still match the session
            // via --resume, but we read the PID file alongside to capture
            // status/waitingFor.
            const pidEntry = this.readMatchingPidFile(proc.pid, proc.startTime);

            direct.push({
                process: proc,
                sessionFile: {
                    sessionId,
                    filePath: jsonlPath,
                    projectDir,
                    birthtimeMs: stat.birthtimeMs,
                    resolvedCwd: proc.cwd,
                },
                pidStatus: this.mapPidStatus(pidEntry?.status),
                waitingFor: pidEntry?.waitingFor,
            });
        }

        return { direct, fallback };
    }

    private extractResumeSessionId(command: string): string | null {
        const match = command.match(/--resume\s+([0-9a-f-]{36})/i);
        return match?.[1] ?? null;
    }

    /**
     * Read and parse ~/.claude/sessions/<pid>.json, returning null on any
     * I/O / parse failure or when the file is stale relative to the live
     * process.
     *
     * "Stale" means the PID file's startedAt diverges from the process's
     * start time by more than {@link PID_FILE_STALENESS_MS} — typically
     * a previous Claude Code process recycled the same PID without cleanup.
     */
    private readMatchingPidFile(pid: number, procStartTime?: Date): PidFileEntry | null {
        const pidFilePath = path.join(this.sessionsDir, `${pid}.json`);
        try {
            const entry = JSON.parse(
                fs.readFileSync(pidFilePath, 'utf-8'),
            ) as PidFileEntry;

            if (procStartTime) {
                const deltaMs = Math.abs(procStartTime.getTime() - entry.startedAt);
                if (deltaMs > PID_FILE_STALENESS_MS) {
                    return null;
                }
            }

            return entry;
        } catch {
            return null;
        }
    }

    /**
     * Map the PID file's live status string to {@link AgentStatus}.
     *
     * Returns undefined for missing / unrecognized values so the caller
     * can fall back to JSONL-derived heuristics.
     */
    private mapPidStatus(status: string | undefined): AgentStatus | undefined {
        switch (status) {
            case 'running':
                return AgentStatus.RUNNING;
            case 'waiting':
                return AgentStatus.WAITING;
            case 'idle':
                return AgentStatus.IDLE;
            default:
                return undefined;
        }
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
        direct: ClaudeDirectMatch[];
        fallback: ProcessInfo[];
    } {
        const direct: ClaudeDirectMatch[] = [];
        const fallback: ProcessInfo[] = [];

        for (const proc of processes) {
            const entry = this.readMatchingPidFile(proc.pid, proc.startTime);
            if (!entry) {
                fallback.push(proc);
                continue;
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
                pidStatus: this.mapPidStatus(entry.status),
                waitingFor: entry.waitingFor,
            });
        }

        return { direct, fallback };
    }
}
