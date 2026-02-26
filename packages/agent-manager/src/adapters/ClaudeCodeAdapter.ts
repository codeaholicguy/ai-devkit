/**
 * Claude Code Adapter
 * 
 * Detects running Claude Code agents by reading session files
 * from ~/.claude/ directory and correlating with running processes.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AgentAdapter, AgentInfo, ProcessInfo } from './AgentAdapter';
import { AgentStatus } from './AgentAdapter';
import { listProcesses } from '../utils/process';
import { readLastLines, readJsonLines, readJson } from '../utils/file';

/**
 * Structure of ~/.claude/projects/{path}/sessions-index.json
 */
interface SessionsIndex {
    originalPath: string;
}

enum SessionEntryType {
    ASSISTANT = 'assistant',
    USER = 'user',
    PROGRESS = 'progress',
    THINKING = 'thinking',
    SYSTEM = 'system',
    MESSAGE = 'message',
    TEXT = 'text',
}

/**
 * Entry in session JSONL file
 */
interface SessionEntry {
    type?: SessionEntryType;
    timestamp?: string;
    slug?: string;
    cwd?: string;
    sessionId?: string;
    message?: {
        content?: Array<{
            type?: string;
            text?: string;
            content?: string;
        }>;
    };
    [key: string]: unknown;
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
    sessionLogPath: string;
    lastEntry?: SessionEntry;
    lastActive?: Date;
}

type SessionMatchMode = 'cwd' | 'project-parent';

/**
 * Claude Code Adapter
 * 
 * Detects Claude Code agents by:
 * 1. Finding running claude processes
 * 2. Reading session files from ~/.claude/projects/
 * 3. Matching sessions to processes via CWD
 * 4. Extracting status from session JSONL
 * 5. Extracting summary from history.jsonl
 */
export class ClaudeCodeAdapter implements AgentAdapter {
    readonly type = 'claude' as const;

    /** Threshold in minutes before considering a session idle */
    private static readonly IDLE_THRESHOLD_MINUTES = 5;

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
        return processInfo.command.toLowerCase().includes('claude');
    }

    /**
     * Detect running Claude Code agents
     */
    async detectAgents(): Promise<AgentInfo[]> {
        const claudeProcesses = listProcesses({ namePattern: 'claude' }).filter((processInfo) =>
            this.canHandle(processInfo),
        );

        if (claudeProcesses.length === 0) {
            return [];
        }

        const sessions = this.readSessions();
        const history = this.readHistory();
        const historyByProjectPath = this.indexHistoryByProjectPath(history);
        const historyBySessionId = new Map<string, HistoryEntry>();
        for (const entry of history) {
            historyBySessionId.set(entry.sessionId, entry);
        }

        const sortedSessions = [...sessions].sort((a, b) => {
            const timeA = a.lastActive?.getTime() || 0;
            const timeB = b.lastActive?.getTime() || 0;
            return timeB - timeA;
        });

        const usedSessionIds = new Set<string>();
        const assignedPids = new Set<number>();
        const agents: AgentInfo[] = [];

        this.assignSessionsForMode(
            'cwd',
            claudeProcesses,
            sortedSessions,
            usedSessionIds,
            assignedPids,
            historyBySessionId,
            agents,
        );
        this.assignHistoryEntriesForExactProcessCwd(
            claudeProcesses,
            assignedPids,
            historyByProjectPath,
            usedSessionIds,
            agents,
        );
        this.assignSessionsForMode(
            'project-parent',
            claudeProcesses,
            sortedSessions,
            usedSessionIds,
            assignedPids,
            historyBySessionId,
            agents,
        );
        for (const processInfo of claudeProcesses) {
            if (assignedPids.has(processInfo.pid)) {
                continue;
            }

            assignedPids.add(processInfo.pid);
            agents.push(this.mapProcessOnlyAgent(processInfo, agents, historyByProjectPath, usedSessionIds));
        }

        return agents;
    }

    private assignHistoryEntriesForExactProcessCwd(
        claudeProcesses: ProcessInfo[],
        assignedPids: Set<number>,
        historyByProjectPath: Map<string, HistoryEntry[]>,
        usedSessionIds: Set<string>,
        agents: AgentInfo[],
    ): void {
        for (const processInfo of claudeProcesses) {
            if (assignedPids.has(processInfo.pid)) {
                continue;
            }

            const historyEntry = this.selectHistoryForProcess(processInfo.cwd || '', historyByProjectPath, usedSessionIds);
            if (!historyEntry) {
                continue;
            }

            assignedPids.add(processInfo.pid);
            usedSessionIds.add(historyEntry.sessionId);
            agents.push(this.mapHistoryToAgent(processInfo, historyEntry, agents));
        }
    }

    private assignSessionsForMode(
        mode: SessionMatchMode,
        claudeProcesses: ProcessInfo[],
        sessions: ClaudeSession[],
        usedSessionIds: Set<string>,
        assignedPids: Set<number>,
        historyBySessionId: Map<string, HistoryEntry>,
        agents: AgentInfo[],
    ): void {
        for (const processInfo of claudeProcesses) {
            if (assignedPids.has(processInfo.pid)) {
                continue;
            }

            const session = this.selectBestSession(processInfo, sessions, usedSessionIds, mode);
            if (!session) {
                continue;
            }

            usedSessionIds.add(session.sessionId);
            assignedPids.add(processInfo.pid);
            agents.push(this.mapSessionToAgent(session, processInfo, historyBySessionId, agents));
        }
    }

    private selectBestSession(
        processInfo: ProcessInfo,
        sessions: ClaudeSession[],
        usedSessionIds: Set<string>,
        mode: SessionMatchMode,
    ): ClaudeSession | null {
        const candidates = sessions.filter((session) => {
            if (usedSessionIds.has(session.sessionId)) {
                return false;
            }

            if (mode === 'cwd') {
                return this.pathEquals(processInfo.cwd, session.lastCwd)
                    || this.pathEquals(processInfo.cwd, session.projectPath);
            }

            if (mode === 'project-parent') {
                return this.isChildPath(processInfo.cwd, session.projectPath)
                    || this.isChildPath(processInfo.cwd, session.lastCwd);
            }

            return false;
        });

        if (candidates.length === 0) {
            return null;
        }

        if (mode !== 'project-parent') {
            return candidates[0];
        }

        return candidates.sort((a, b) => {
            const depthA = Math.max(this.pathDepth(a.projectPath), this.pathDepth(a.lastCwd));
            const depthB = Math.max(this.pathDepth(b.projectPath), this.pathDepth(b.lastCwd));
            if (depthA !== depthB) {
                return depthB - depthA;
            }

            const lastActiveA = a.lastActive?.getTime() || 0;
            const lastActiveB = b.lastActive?.getTime() || 0;
            return lastActiveB - lastActiveA;
        })[0];
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
            lastActive: session.lastActive || new Date(),
        };
    }

    private mapProcessOnlyAgent(
        processInfo: ProcessInfo,
        existingAgents: AgentInfo[],
        historyByProjectPath: Map<string, HistoryEntry[]>,
        usedSessionIds: Set<string>,
    ): AgentInfo {
        const projectPath = processInfo.cwd || '';
        const historyEntry = this.selectHistoryForProcess(projectPath, historyByProjectPath, usedSessionIds);
        const sessionId = historyEntry?.sessionId || `pid-${processInfo.pid}`;
        const lastActive = historyEntry ? new Date(historyEntry.timestamp) : new Date();
        if (historyEntry) {
            usedSessionIds.add(historyEntry.sessionId);
        }

        const processSession: ClaudeSession = {
            sessionId,
            projectPath,
            lastCwd: projectPath,
            sessionLogPath: '',
            lastActive,
        };

        return {
            name: this.generateAgentName(processSession, existingAgents),
            type: this.type,
            status: AgentStatus.RUNNING,
            summary: historyEntry?.display || 'Claude process running',
            pid: processInfo.pid,
            projectPath,
            sessionId: processSession.sessionId,
            lastActive: processSession.lastActive || new Date(),
        };
    }

    private mapHistoryToAgent(
        processInfo: ProcessInfo,
        historyEntry: HistoryEntry,
        existingAgents: AgentInfo[],
    ): AgentInfo {
        const projectPath = processInfo.cwd || historyEntry.project;
        const historySession: ClaudeSession = {
            sessionId: historyEntry.sessionId,
            projectPath,
            lastCwd: projectPath,
            sessionLogPath: '',
            lastActive: new Date(historyEntry.timestamp),
        };

        return {
            name: this.generateAgentName(historySession, existingAgents),
            type: this.type,
            status: AgentStatus.RUNNING,
            summary: historyEntry.display || 'Claude process running',
            pid: processInfo.pid,
            projectPath,
            sessionId: historySession.sessionId,
            lastActive: historySession.lastActive || new Date(),
        };
    }

    private indexHistoryByProjectPath(historyEntries: HistoryEntry[]): Map<string, HistoryEntry[]> {
        const grouped = new Map<string, HistoryEntry[]>();

        for (const entry of historyEntries) {
            const key = this.normalizePath(entry.project);
            const list = grouped.get(key) || [];
            list.push(entry);
            grouped.set(key, list);
        }

        for (const [key, list] of grouped.entries()) {
            grouped.set(
                key,
                [...list].sort((a, b) => b.timestamp - a.timestamp),
            );
        }

        return grouped;
    }

    private selectHistoryForProcess(
        processCwd: string,
        historyByProjectPath: Map<string, HistoryEntry[]>,
        usedSessionIds: Set<string>,
    ): HistoryEntry | undefined {
        if (!processCwd) {
            return undefined;
        }

        const candidates = historyByProjectPath.get(this.normalizePath(processCwd)) || [];
        return candidates.find((entry) => !usedSessionIds.has(entry.sessionId));
    }

    /**
     * Read all Claude Code sessions
     */
    private readSessions(): ClaudeSession[] {
        if (!fs.existsSync(this.projectsDir)) {
            return [];
        }

        const sessions: ClaudeSession[] = [];
        const projectDirs = fs.readdirSync(this.projectsDir);

        for (const dirName of projectDirs) {
            if (dirName.startsWith('.')) {
                continue;
            }

            const projectDir = path.join(this.projectsDir, dirName);
            if (!fs.statSync(projectDir).isDirectory()) {
                continue;
            }

            // Read sessions-index.json to get original project path
            const indexPath = path.join(projectDir, 'sessions-index.json');
            if (!fs.existsSync(indexPath)) {
                continue;
            }

            const sessionsIndex = readJson<SessionsIndex>(indexPath);
            if (!sessionsIndex) {
                console.error(`Failed to parse ${indexPath}`);
                continue;
            }

            const sessionFiles = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));

            for (const sessionFile of sessionFiles) {
                const sessionId = sessionFile.replace('.jsonl', '');
                const sessionLogPath = path.join(projectDir, sessionFile);

                try {
                    const sessionData = this.readSessionLog(sessionLogPath);

                    sessions.push({
                        sessionId,
                        projectPath: sessionsIndex.originalPath,
                        lastCwd: sessionData.lastCwd,
                        slug: sessionData.slug,
                        sessionLogPath,
                        lastEntry: sessionData.lastEntry,
                        lastActive: sessionData.lastActive,
                    });
                } catch (error) {
                    console.error(`Failed to read session ${sessionId}:`, error);
                    continue;
                }
            }
        }

        return sessions;
    }

    /**
     * Read a session JSONL file
     * Only reads last 100 lines for performance with large files
     */
    private readSessionLog(logPath: string): {
        slug?: string;
        lastEntry?: SessionEntry;
        lastActive?: Date;
        lastCwd?: string;
    } {
        const lines = readLastLines(logPath, 100);

        let slug: string | undefined;
        let lastEntry: SessionEntry | undefined;
        let lastActive: Date | undefined;
        let lastCwd: string | undefined;

        for (const line of lines) {
            try {
                const entry: SessionEntry = JSON.parse(line);

                if (entry.slug && !slug) {
                    slug = entry.slug;
                }

                lastEntry = entry;

                if (entry.timestamp) {
                    lastActive = new Date(entry.timestamp);
                }

                if (typeof entry.cwd === 'string' && entry.cwd.trim().length > 0) {
                    lastCwd = entry.cwd;
                }
            } catch (error) {
                continue;
            }
        }

        return { slug, lastEntry, lastActive, lastCwd };
    }

    /**
     * Read history.jsonl for user prompts
     * Only reads last 100 lines for performance
     */
    private readHistory(): HistoryEntry[] {
        return readJsonLines<HistoryEntry>(this.historyPath, 100);
    }

    /**
     * Determine agent status from session entry
     */
    private determineStatus(session: ClaudeSession): AgentStatus {
        if (!session.lastEntry) {
            return AgentStatus.UNKNOWN;
        }

        const entryType = session.lastEntry.type;
        const lastActive = session.lastActive || new Date(0);
        const ageMinutes = (Date.now() - lastActive.getTime()) / 1000 / 60;

        if (ageMinutes > ClaudeCodeAdapter.IDLE_THRESHOLD_MINUTES) {
            return AgentStatus.IDLE;
        }

        if (entryType === SessionEntryType.USER) {
            // Check if user interrupted manually - this puts agent back in waiting state
            const content = session.lastEntry.message?.content;
            if (Array.isArray(content)) {
                const isInterrupted = content.some(c =>
                    (c.type === SessionEntryType.TEXT && c.text?.includes('[Request interrupted')) ||
                    (c.type === 'tool_result' && c.content?.includes('[Request interrupted'))
                );
                if (isInterrupted) return AgentStatus.WAITING;
            }
            return AgentStatus.RUNNING;
        }

        if (entryType === SessionEntryType.PROGRESS || entryType === SessionEntryType.THINKING) {
            return AgentStatus.RUNNING;
        } else if (entryType === SessionEntryType.ASSISTANT) {
            return AgentStatus.WAITING;
        } else if (entryType === SessionEntryType.SYSTEM) {
            return AgentStatus.IDLE;
        }

        return AgentStatus.UNKNOWN;
    }

    /**
     * Generate unique agent name
     * Uses project basename, appends slug if multiple sessions for same project
     */
    private generateAgentName(session: ClaudeSession, existingAgents: AgentInfo[]): string {
        const projectName = path.basename(session.projectPath) || 'claude';

        const sameProjectAgents = existingAgents.filter(
            a => a.projectPath === session.projectPath
        );

        if (sameProjectAgents.length === 0) {
            return projectName;
        }

        // Multiple sessions for same project, append slug
        if (session.slug) {
            // Use first word of slug for brevity (with safety check for format)
            const slugPart = session.slug.includes('-')
                ? session.slug.split('-')[0]
                : session.slug.slice(0, 8);
            return `${projectName} (${slugPart})`;
        }

        // No slug available, use session ID prefix
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
        return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${path.sep}`);
    }

    private normalizePath(value: string): string {
        const resolved = path.resolve(value);
        if (resolved.length > 1 && resolved.endsWith(path.sep)) {
            return resolved.slice(0, -1);
        }
        return resolved;
    }

    private pathDepth(value?: string): number {
        if (!value) {
            return 0;
        }

        return this.normalizePath(value).split(path.sep).filter(Boolean).length;
    }

}
