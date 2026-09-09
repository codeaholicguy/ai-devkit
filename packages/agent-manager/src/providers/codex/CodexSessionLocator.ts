import * as fs from 'fs';
import * as path from 'path';
import type { ProcessInfo } from '../../adapters/AgentAdapter.js';
import { matchProcessesToSessions, type MatchResult } from '../../utils/matching.js';
import {
    batchGetSessionFileBirthtimes,
    isDirectory,
    safeReadFile,
    safeReaddir,
    safeStat,
    type SessionFile,
} from '../../utils/session.js';
import { CodexSessionParser, type CodexEventEntry } from './CodexSessionParser.js';

export interface CodexDirectMatch {
    process: ProcessInfo;
    sessionFile: SessionFile;
}

export interface CodexProcessSessionMatches {
    direct: CodexDirectMatch[];
    legacyMatches: MatchResult[];
    fallback: ProcessInfo[];
    contentCache: Map<string, string>;
}

export interface CodexDiscoveredSessions {
    sessions: SessionFile[];
    contentCache: Map<string, string>;
}

export interface CodexSessionLocatorOptions {
    sessionsDir?: string;
}

const PROCESS_START_DAY_WINDOW_DAYS = 1;

export class CodexSessionLocator {
    private readonly sessionsDir: string;

    constructor(
        options: CodexSessionLocatorOptions = {},
        private readonly parser: CodexSessionParser = new CodexSessionParser(),
    ) {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.sessionsDir = options.sessionsDir ?? path.join(homeDir, '.codex', 'sessions');
    }

    matchRunningProcesses(processes: ProcessInfo[]): CodexProcessSessionMatches {
        const { direct, fallback } = this.tryResumeMatching(processes);
        const { sessions, contentCache } = this.discoverLiveSessions(fallback);
        const legacyMatches =
            fallback.length > 0 && sessions.length > 0
                ? matchProcessesToSessions(fallback, sessions)
                : [];

        return { direct, legacyMatches, fallback, contentCache };
    }

    tryResumeMatching(processes: ProcessInfo[]): {
        direct: CodexDirectMatch[];
        fallback: ProcessInfo[];
    } {
        const direct: CodexDirectMatch[] = [];
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

    discoverLiveSessions(processes: ProcessInfo[]): CodexDiscoveredSessions {
        const empty = { sessions: [], contentCache: new Map<string, string>() };
        if (!fs.existsSync(this.sessionsDir)) return empty;

        const dateDirs = this.getDateDirs(processes);
        if (dateDirs.length === 0) return empty;

        return this.discoverSessionFilesInDateDirs(dateDirs);
    }

    discoverSessionFilesInDateDirs(dateDirs: string[]): CodexDiscoveredSessions {
        const files = batchGetSessionFileBirthtimes(dateDirs);
        const contentCache = new Map<string, string>();

        for (const file of files) {
            try {
                const content = fs.readFileSync(file.filePath, 'utf-8');
                contentCache.set(file.filePath, content);

                const firstLine = content.split('\n')[0]?.trim();
                if (firstLine) {
                    const parsed = JSON.parse(firstLine) as CodexEventEntry;
                    if (parsed.type === 'session_meta') {
                        file.resolvedCwd = parsed.payload?.cwd || '';
                        const metaTimestampMs = this.parser.parseMetaTimestampMs(parsed.payload?.timestamp);
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

    discoverHistoricalSessionFiles(): string[] {
        return this.collectAllSessionFiles();
    }

    findSessionFileById(sessionId: string): SessionFile | null {
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
                const metaTimestampMs = this.parser.parseMetaTimestampMs(parsed.payload?.timestamp);

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

    collectAllSessionFiles(): string[] {
        const out: string[] = [];

        for (const yearEntry of safeReaddir(this.sessionsDir)) {
            const yearDir = path.join(this.sessionsDir, yearEntry);
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

    private extractResumeSessionId(command: string): string | null {
        const match = command.match(/(?:^|\s)resume\s+([0-9a-f-]{36})(?:\s|$)/i);
        return match?.[1] ?? null;
    }

    private getCandidateSessionFiles(sessionId: string): string[] {
        const sessionDate = this.tryParseUuidV7Date(sessionId);
        if (!sessionDate) return this.collectAllSessionFiles();

        return this.collectSessionFilesInDateDirs(
            this.getDateDirsAroundDate(sessionDate, PROCESS_START_DAY_WINDOW_DAYS),
        );
    }

    private getDateDirs(processes: ProcessInfo[]): string[] {
        const dayKeys = new Set<string>();

        for (const proc of processes) {
            const startTime = proc.startTime || new Date();
            for (let offset = -PROCESS_START_DAY_WINDOW_DAYS; offset <= PROCESS_START_DAY_WINDOW_DAYS; offset++) {
                const day = new Date(startTime.getTime());
                day.setDate(day.getDate() + offset);
                dayKeys.add(this.toSessionDayKey(day));
            }
        }

        const dirs: string[] = [];
        for (const dayKey of dayKeys) {
            const dayDir = path.join(this.sessionsDir, dayKey);
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
            const dayDir = path.join(this.sessionsDir, this.toSessionDayKey(day));
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
}
