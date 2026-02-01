/**
 * Claude Code Adapter
 * 
 * Detects running Claude Code agents by reading session files
 * from ~/.claude/ directory and correlating with running processes.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AgentAdapter, AgentInfo, ProcessInfo } from './AgentAdapter';
import { AgentStatus, STATUS_CONFIG } from './AgentAdapter';
import { listProcesses } from '../../util/process';
import { readLastLines, readJsonLines, readJson } from '../../util/file';

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
    type?: 'assistant' | 'user' | 'progress' | 'thinking' | 'system' | 'message' | 'text';
    timestamp?: string;
    slug?: string;
    cwd?: string;
    sessionId?: string;
    [key: string]: any;
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
    slug?: string;
    sessionLogPath: string;
    lastEntry?: SessionEntry;
    lastActive?: Date;
}

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
    readonly type = 'Claude Code' as const;

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
        // 1. Find running claude processes
        const claudeProcesses = listProcesses({ namePattern: 'claude' });

        if (claudeProcesses.length === 0) {
            return [];
        }

        // 2. Read all sessions
        const sessions = this.readSessions();

        // 3. Read history for summaries
        const history = this.readHistory();

        // 4. Group processes by CWD
        const processesByCwd = new Map<string, ProcessInfo[]>();
        for (const p of claudeProcesses) {
            const list = processesByCwd.get(p.cwd) || [];
            list.push(p);
            processesByCwd.set(p.cwd, list);
        }

        // 5. Match sessions to processes
        const agents: AgentInfo[] = [];

        for (const [cwd, processes] of processesByCwd) {
            // Find sessions for this project path
            const projectSessions = sessions.filter(s => s.projectPath === cwd);

            if (projectSessions.length === 0) {
                continue;
            }

            // Sort sessions by last active time (newest first)
            projectSessions.sort((a, b) => {
                const timeA = a.lastActive?.getTime() || 0;
                const timeB = b.lastActive?.getTime() || 0;
                return timeB - timeA;
            });

            // Map processes to the most recent sessions
            // If there are 2 processes, we take the 2 most recent sessions
            const activeSessions = projectSessions.slice(0, processes.length);

            for (let i = 0; i < activeSessions.length; i++) {
                const session = activeSessions[i];
                const process = processes[i]; // Assign process to session (arbitrary 1-to-1 mapping)

                const historyEntry = [...history].reverse().find(
                    h => h.sessionId === session.sessionId
                );
                const summary = historyEntry?.display || 'Session started';
                const status = this.determineStatus(session);
                const agentName = this.generateAgentName(session, agents); // Pass currently built agents for collision checks

                // Get status display config
                const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG[AgentStatus.UNKNOWN];
                const statusDisplay = `${statusConfig.emoji} ${statusConfig.label}`;
                const lastActiveDisplay = this.getRelativeTime(session.lastActive || new Date());

                agents.push({
                    name: agentName,
                    type: this.type,
                    status,
                    statusDisplay,
                    summary: this.truncateSummary(summary),
                    pid: process.pid,
                    projectPath: session.projectPath,
                    sessionId: session.sessionId,
                    slug: session.slug,
                    lastActive: session.lastActive || new Date(),
                    lastActiveDisplay,
                });
            }
        }

        return agents;
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
    } {
        const lines = readLastLines(logPath, 100);

        let slug: string | undefined;
        let lastEntry: SessionEntry | undefined;
        let lastActive: Date | undefined;

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
            } catch (error) {
                continue;
            }
        }

        return { slug, lastEntry, lastActive };
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

        if (entryType === 'user') {
            // Check if user interrupted manually - this puts agent back in waiting state
            const content = (session.lastEntry as any)?.message?.content;
            if (Array.isArray(content)) {
                const isInterrupted = content.some((c: any) =>
                    (c.type === 'text' && c.text?.includes('[Request interrupted')) ||
                    (c.type === 'tool_result' && c.content?.includes('[Request interrupted'))
                );
                if (isInterrupted) return AgentStatus.WAITING;
            }
            return AgentStatus.RUNNING;
        }

        if (entryType === 'progress' || entryType === 'thinking') {
            return AgentStatus.RUNNING;
        } else if (entryType === 'assistant') {
            return AgentStatus.WAITING;
        } else if (entryType === 'system') {
            return AgentStatus.IDLE;
        }

        return AgentStatus.UNKNOWN;
    }

    /**
     * Generate unique agent name
     * Uses project basename, appends slug if multiple sessions for same project
     */
    private generateAgentName(session: ClaudeSession, existingAgents: AgentInfo[]): string {
        const projectName = path.basename(session.projectPath);

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

    /**
     * Truncate summary to ~40 characters
     */
    private truncateSummary(summary: string, maxLength: number = 40): string {
        if (summary.length <= maxLength) {
            return summary;
        }
        return summary.slice(0, maxLength - 3) + '...';
    }

    /**
     * Get relative time display (e.g., "2m ago", "just now")
     */
    private getRelativeTime(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;

        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    }
}
