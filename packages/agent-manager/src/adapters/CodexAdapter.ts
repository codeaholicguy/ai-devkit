/**
 * Codex Adapter
 *
 * Detects running Codex agents by combining:
 * 1. Running `codex` processes
 * 2. Session metadata under ~/.codex/sessions
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { AgentAdapter, AgentInfo, ProcessInfo } from './AgentAdapter';
import { AgentStatus } from './AgentAdapter';
import { listProcesses } from '../utils/process';
import { readJsonLines } from '../utils/file';

interface CodexSessionMetaPayload {
    id?: string;
    timestamp?: string;
    cwd?: string;
}

interface CodexSessionMetaEntry {
    type?: string;
    payload?: CodexSessionMetaPayload;
}

interface CodexEventEntry {
    timestamp?: string;
    type?: string;
    payload?: {
        type?: string;
        message?: string;
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

type SessionMatchMode = 'cwd' | 'missing-cwd';

export class CodexAdapter implements AgentAdapter {
    readonly type = 'codex' as const;

    /** Keep status thresholds aligned across adapters. */
    private static readonly IDLE_THRESHOLD_MINUTES = 5;
    /** Limit session parsing per run to keep list latency bounded. */
    private static readonly MIN_SESSION_SCAN = 12;
    private static readonly MAX_SESSION_SCAN = 40;
    private static readonly SESSION_SCAN_MULTIPLIER = 4;
    /** Also include session files around process start day to recover long-lived processes. */
    private static readonly PROCESS_START_DAY_WINDOW_DAYS = 1;
    /** Matching tolerance between process start time and session start time. */
    private static readonly PROCESS_SESSION_TIME_TOLERANCE_MS = 2 * 60 * 1000;

    private codexSessionsDir: string;

    constructor() {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.codexSessionsDir = path.join(homeDir, '.codex', 'sessions');
    }

    canHandle(processInfo: ProcessInfo): boolean {
        return this.isCodexExecutable(processInfo.command);
    }

    async detectAgents(): Promise<AgentInfo[]> {
        const codexProcesses = this.listCodexProcesses();

        if (codexProcesses.length === 0) {
            return [];
        }

        const processStartByPid = this.getProcessStartTimes(codexProcesses.map((processInfo) => processInfo.pid));

        const sessionScanLimit = this.calculateSessionScanLimit(codexProcesses.length);
        const sessions = this.readSessions(sessionScanLimit, processStartByPid);
        if (sessions.length === 0) {
            return codexProcesses.map((processInfo) =>
                this.mapProcessOnlyAgent(processInfo, [], 'No Codex session metadata found'),
            );
        }

        const sortedSessions = [...sessions].sort(
            (a, b) => b.lastActive.getTime() - a.lastActive.getTime(),
        );
        const usedSessionIds = new Set<string>();
        const assignedPids = new Set<number>();
        const agents: AgentInfo[] = [];

        // Match exact cwd first, then missing-cwd sessions.
        this.assignSessionsForMode(
            'cwd',
            codexProcesses,
            sortedSessions,
            usedSessionIds,
            assignedPids,
            processStartByPid,
            agents,
        );
        this.assignSessionsForMode(
            'missing-cwd',
            codexProcesses,
            sortedSessions,
            usedSessionIds,
            assignedPids,
            processStartByPid,
            agents,
        );

        // Every running codex process should still be listed.
        for (const processInfo of codexProcesses) {
            if (assignedPids.has(processInfo.pid)) {
                continue;
            }

            this.addProcessOnlyAgent(processInfo, assignedPids, agents);
        }

        return agents;
    }

    private listCodexProcesses(): ProcessInfo[] {
        return listProcesses({ namePattern: 'codex' }).filter((processInfo) =>
            this.canHandle(processInfo),
        );
    }

    private calculateSessionScanLimit(processCount: number): number {
        return Math.min(
            Math.max(
                processCount * CodexAdapter.SESSION_SCAN_MULTIPLIER,
                CodexAdapter.MIN_SESSION_SCAN,
            ),
            CodexAdapter.MAX_SESSION_SCAN,
        );
    }

    private assignSessionsForMode(
        mode: SessionMatchMode,
        codexProcesses: ProcessInfo[],
        sessions: CodexSession[],
        usedSessionIds: Set<string>,
        assignedPids: Set<number>,
        processStartByPid: Map<number, Date>,
        agents: AgentInfo[],
    ): void {
        for (const processInfo of codexProcesses) {
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

            this.addMappedSessionAgent(session, processInfo, usedSessionIds, assignedPids, agents);
        }
    }

    private addMappedSessionAgent(
        session: CodexSession,
        processInfo: ProcessInfo,
        usedSessionIds: Set<string>,
        assignedPids: Set<number>,
        agents: AgentInfo[],
    ): void {
        usedSessionIds.add(session.sessionId);
        assignedPids.add(processInfo.pid);
        agents.push(this.mapSessionToAgent(session, processInfo, agents));
    }

    private addProcessOnlyAgent(
        processInfo: ProcessInfo,
        assignedPids: Set<number>,
        agents: AgentInfo[],
    ): void {
        assignedPids.add(processInfo.pid);
        agents.push(this.mapProcessOnlyAgent(processInfo, agents));
    }

    private mapSessionToAgent(
        session: CodexSession,
        processInfo: ProcessInfo,
        existingAgents: AgentInfo[],
    ): AgentInfo {
        return {
            name: this.generateAgentName(session, existingAgents),
            type: this.type,
            status: this.determineStatus(session),
            summary: session.summary || 'Codex session active',
            pid: processInfo.pid,
            projectPath: session.projectPath || processInfo.cwd || '',
            sessionId: session.sessionId,
            lastActive: session.lastActive,
        };
    }

    private mapProcessOnlyAgent(
        processInfo: ProcessInfo,
        existingAgents: AgentInfo[],
        summary: string = 'Codex process running',
    ): AgentInfo {
        const syntheticSession: CodexSession = {
            sessionId: `pid-${processInfo.pid}`,
            projectPath: processInfo.cwd || '',
            summary,
            sessionStart: new Date(),
            lastActive: new Date(),
            lastPayloadType: 'process_only',
        };

        return {
            name: this.generateAgentName(syntheticSession, existingAgents),
            type: this.type,
            status: AgentStatus.RUNNING,
            summary,
            pid: processInfo.pid,
            projectPath: processInfo.cwd || '',
            sessionId: syntheticSession.sessionId,
            lastActive: syntheticSession.lastActive,
        };
    }

    private readSessions(limit: number, processStartByPid: Map<number, Date>): CodexSession[] {
        const sessionFiles = this.findSessionFiles(limit, processStartByPid);
        const sessions: CodexSession[] = [];

        for (const sessionFile of sessionFiles) {
            try {
                const session = this.readSession(sessionFile);
                if (session) {
                    sessions.push(session);
                }
            } catch (error) {
                console.error(`Failed to parse Codex session ${sessionFile}:`, error);
            }
        }

        return sessions;
    }

    private findSessionFiles(limit: number, processStartByPid: Map<number, Date>): string[] {
        if (!fs.existsSync(this.codexSessionsDir)) {
            return [];
        }

        const files: Array<{ path: string; mtimeMs: number }> = [];
        const stack: string[] = [this.codexSessionsDir];

        while (stack.length > 0) {
            const currentDir = stack.pop();
            if (!currentDir || !fs.existsSync(currentDir)) {
                continue;
            }

            for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    stack.push(fullPath);
                    continue;
                }

                if (entry.isFile() && entry.name.endsWith('.jsonl')) {
                    try {
                        files.push({
                            path: fullPath,
                            mtimeMs: fs.statSync(fullPath).mtimeMs,
                        });
                    } catch {
                        continue;
                    }
                }
            }
        }

        const recentFiles = files
            .sort((a, b) => b.mtimeMs - a.mtimeMs)
            .slice(0, limit)
            .map((file) => file.path);
        const processDayFiles = this.findProcessDaySessionFiles(processStartByPid);

        const selectedPaths = new Set(recentFiles);
        for (const processDayFile of processDayFiles) {
            selectedPaths.add(processDayFile);
        }

        return Array.from(selectedPaths);
    }

    private findProcessDaySessionFiles(processStartByPid: Map<number, Date>): string[] {
        const files: string[] = [];
        const dayKeys = new Set<string>();
        const dayWindow = CodexAdapter.PROCESS_START_DAY_WINDOW_DAYS;

        for (const processStart of processStartByPid.values()) {
            for (let offset = -dayWindow; offset <= dayWindow; offset++) {
                const day = new Date(processStart.getTime());
                day.setDate(day.getDate() + offset);
                dayKeys.add(this.toSessionDayKey(day));
            }
        }

        for (const dayKey of dayKeys) {
            const dayDir = path.join(this.codexSessionsDir, dayKey);
            if (!fs.existsSync(dayDir)) {
                continue;
            }

            for (const entry of fs.readdirSync(dayDir, { withFileTypes: true })) {
                if (entry.isFile() && entry.name.endsWith('.jsonl')) {
                    files.push(path.join(dayDir, entry.name));
                }
            }
        }

        return files;
    }

    private toSessionDayKey(date: Date): string {
        const yyyy = String(date.getFullYear()).padStart(4, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return path.join(yyyy, mm, dd);
    }

    private readSession(filePath: string): CodexSession | null {
        const firstLine = this.readFirstLine(filePath);
        if (!firstLine) {
            return null;
        }

        const metaEntry = this.parseSessionMeta(firstLine);
        if (!metaEntry?.payload?.id) {
            return null;
        }

        const entries = readJsonLines<CodexEventEntry>(filePath, 300);
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

    private readFirstLine(filePath: string): string {
        const content = fs.readFileSync(filePath, 'utf-8');
        return content.split('\n')[0]?.trim() || '';
    }

    private parseSessionMeta(line: string): CodexSessionMetaEntry | null {
        try {
            const parsed = JSON.parse(line) as CodexSessionMetaEntry;
            if (parsed.type !== 'session_meta') {
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
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
        if (!value) {
            return null;
        }

        const timestamp = new Date(value);
        return Number.isNaN(timestamp.getTime()) ? null : timestamp;
    }

    private selectBestSession(
        processInfo: ProcessInfo,
        sessions: CodexSession[],
        usedSessionIds: Set<string>,
        processStartByPid: Map<number, Date>,
        mode: SessionMatchMode,
    ): CodexSession | undefined {
        const candidates = this.filterCandidateSessions(processInfo, sessions, usedSessionIds, mode);

        if (candidates.length === 0) {
            return undefined;
        }

        const processStart = processStartByPid.get(processInfo.pid);
        if (!processStart) {
            return candidates.sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime())[0];
        }

        return this.rankCandidatesByStartTime(candidates, processStart)[0];
    }

    private filterCandidateSessions(
        processInfo: ProcessInfo,
        sessions: CodexSession[],
        usedSessionIds: Set<string>,
        mode: SessionMatchMode,
    ): CodexSession[] {
        return sessions.filter((session) => {
            if (usedSessionIds.has(session.sessionId)) {
                return false;
            }

            if (mode === 'cwd') {
                return session.projectPath === processInfo.cwd;
            }

            if (mode === 'missing-cwd') {
                return !session.projectPath;
            }
        });
    }

    private rankCandidatesByStartTime(candidates: CodexSession[], processStart: Date): CodexSession[] {
        const toleranceMs = CodexAdapter.PROCESS_SESSION_TIME_TOLERANCE_MS;

        return candidates
            .map((session) => {
                const diffMs = Math.abs(session.sessionStart.getTime() - processStart.getTime());
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
            const output = execSync(`ps -o pid=,etime= -p ${pids.join(',')}`, {
                encoding: 'utf-8',
            });
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
        const match = etime.trim().match(/^(?:(\d+)-)?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
        if (!match) {
            return null;
        }

        const days = Number.parseInt(match[1] || '0', 10);
        const hours = Number.parseInt(match[2] || '0', 10);
        const minutes = Number.parseInt(match[3] || '0', 10);
        const seconds = Number.parseInt(match[4] || '0', 10);

        return (((days * 24 + hours) * 60 + minutes) * 60) + seconds;
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
        if (value.length <= maxLength) {
            return value;
        }
        return `${value.slice(0, maxLength - 3)}...`;
    }

    private isCodexExecutable(command: string): boolean {
        const executable = command.trim().split(/\s+/)[0] || '';
        const base = path.basename(executable).toLowerCase();
        return base === 'codex' || base === 'codex.exe';
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

    private generateAgentName(session: CodexSession, existingAgents: AgentInfo[]): string {
        const fallback = `codex-${session.sessionId.slice(0, 8)}`;
        const baseName = session.projectPath ? path.basename(path.normalize(session.projectPath)) : fallback;

        const conflict = existingAgents.some((agent) => agent.name === baseName);
        if (!conflict) {
            return baseName || fallback;
        }

        return `${baseName || fallback} (${session.sessionId.slice(0, 8)})`;
    }
}
