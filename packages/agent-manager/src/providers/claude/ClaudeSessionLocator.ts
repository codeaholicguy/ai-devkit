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

interface PidFileEntry {
    pid: number;
    sessionId: string;
    cwd: string;
    startedAt: number;
    kind: string;
    entrypoint: string;
    status?: string;
    waitingFor?: string;
}

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

const PID_FILE_STALENESS_MS = 60000;

export class ClaudeSessionLocator {
    private readonly projectsDir: string;
    private readonly sessionsDir: string;

    constructor(options: ClaudeSessionLocatorOptions = {}) {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.projectsDir = options.projectsDir ?? path.join(homeDir, '.claude', 'projects');
        this.sessionsDir = options.sessionsDir ?? path.join(homeDir, '.claude', 'sessions');
    }

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

    discoverHistoricalSessionFiles(): Array<{ filePath: string; defaultCwd: string }> {
        const out: Array<{ filePath: string; defaultCwd: string }> = [];

        if (!isDirectory(this.projectsDir)) return out;

        for (const dirName of safeReaddir(this.projectsDir)) {
            const projectDir = path.join(this.projectsDir, dirName);
            if (!isDirectory(projectDir)) continue;

            const decoded = dirName.replace(/-/g, '/');
            for (const name of listJsonl(projectDir)) {
                out.push({ filePath: path.join(projectDir, name), defaultCwd: decoded });
            }
        }

        return out;
    }

    getProjectDir(cwd: string): string {
        const encoded = cwd.replace(/[^a-zA-Z0-9]/g, '-');
        return path.join(this.projectsDir, encoded);
    }

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

    tryPidFileMatching(processes: ProcessInfo[]): {
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
