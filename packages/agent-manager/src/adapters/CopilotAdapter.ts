/**
 * Copilot Adapter
 *
 * Detects running GitHub Copilot CLI agents by:
 * 1. Finding running copilot processes via shared listAgentProcesses()
 * 2. Enriching with CWD and start times via shared enrichProcesses()
 * 3. Mapping active ~/.copilot/session-state/{sessionId}/inuse.{pid}.lock files to processes
 * 4. Reading events.jsonl as the primary session/conversation source
 * 5. Reading workspace.yaml as a flat fallback metadata source
 */

import * as path from 'path';
import type {
    AgentAdapter,
    AgentInfo,
    ConversationMessage,
    ListSessionsOptions,
    ProcessInfo,
    SessionSummary,
} from './AgentAdapter.js';
import { AgentStatus } from './AgentAdapter.js';
import { enrichProcesses, findWrapperProcess, findWrapperProcessPids, listAgentProcesses } from '../utils/process.js';
import { generateAgentName } from '../utils/matching.js';
import { isDirectory, safeReadFile, safeReaddir, safeStat } from '../utils/session.js';
import { AgentRegistry, type RegistryEntry } from '../utils/AgentRegistry.js';

interface CopilotEventEntry {
    type?: string;
    data?: {
        sessionId?: string;
        startTime?: string;
        context?: {
            cwd?: string;
            gitRoot?: string;
            branch?: string;
        };
        content?: string;
        transformedContent?: string;
        message?: string;
        text?: string;
        result?: {
            content?: string;
            detailedContent?: string;
        };
        output?: string;
    };
    timestamp?: string;
}

interface CopilotWorkspace {
    id?: string;
    cwd?: string;
    name?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

interface CopilotSession {
    sessionId: string;
    projectPath: string;
    summary: string;
    sessionStart: Date;
    lastActive: Date;
    lastEventType?: string;
    firstUserMessage: string;
    eventsFilePath: string;
}

interface CopilotLock {
    sessionDir: string;
    sessionId: string;
    pid: number;
}

interface CopilotSessionDir {
    sessionDir: string;
    sessionId: string;
}

interface CopilotEventSummary {
    sessionId: string;
    projectPath: string;
    sessionStart: Date;
    lastActive: Date;
    firstUserMessage: string;
    lastText: string;
    lastEventType?: string;
}

export class CopilotAdapter implements AgentAdapter {
    readonly type = 'copilot' as const;

    private static readonly IDLE_THRESHOLD_MINUTES = 5;
    private static readonly VERBOSE_SYSTEM_EVENTS = new Set([
        'system.message',
        'session.info',
        'session.warning',
        'tool.execution_start',
        'tool.execution_complete',
        'function',
        'abort',
    ]);
    private static readonly WAITING_EVENTS = new Set([
        'assistant.message',
        'assistant.turn_end',
        'session.shutdown',
        'abort',
    ]);

    private sessionStateDir: string;
    private registry: AgentRegistry;

    constructor(registry: AgentRegistry = AgentRegistry.default()) {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.sessionStateDir = path.join(homeDir, '.copilot', 'session-state');
        this.registry = registry;
    }

    canHandle(processInfo: ProcessInfo): boolean {
        return this.isCopilotExecutable(processInfo.command);
    }

    async detectAgents(): Promise<AgentInfo[]> {
        const processes = enrichProcesses(listAgentProcesses('copilot'));
        if (processes.length === 0) return [];

        const processByPid = new Map(processes.map((proc) => [proc.pid, proc]));
        const registryEntriesByPid = new Map(this.registry.list().map((entry) => [entry.pid, entry]));
        const matchedPids = new Set<number>();
        const matchedProcesses: ProcessInfo[] = [];
        const agents: AgentInfo[] = [];

        for (const lock of this.discoverActiveLocks()) {
            const proc = processByPid.get(lock.pid);
            if (!proc) continue;

            const session = this.readSessionDir(lock.sessionDir, lock.sessionId);
            if (!session) continue;

            const agent = this.mapSessionToAgent(session, proc);
            this.applyWrapperRegistryName(agent, proc, processes, registryEntriesByPid);
            agents.push(agent);
            matchedPids.add(proc.pid);
            matchedProcesses.push(proc);
        }

        const wrapperPids = findWrapperProcessPids(processes, matchedProcesses);
        for (const proc of processes) {
            if (!matchedPids.has(proc.pid) && !wrapperPids.has(proc.pid)) {
                const agent = this.mapProcessOnlyAgent(proc);
                this.applyWrapperRegistryName(agent, proc, processes, registryEntriesByPid);
                agents.push(agent);
            }
        }

        return agents;
    }

    private applyWrapperRegistryName(
        agent: AgentInfo,
        processInfo: ProcessInfo,
        processes: ProcessInfo[],
        registryEntriesByPid: Map<number, RegistryEntry>,
    ): void {
        const wrapper = findWrapperProcess(processes, processInfo);
        const wrapperEntry = wrapper ? registryEntriesByPid.get(wrapper.pid) : undefined;
        if (wrapperEntry?.type === this.type) {
            agent.name = wrapperEntry.name;
        }
    }

    getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
        const verbose = options?.verbose ?? false;
        const content = safeReadFile(sessionFilePath);
        if (content === undefined) return [];

        const messages: ConversationMessage[] = [];

        for (const entry of this.parseEventLines(content)) {
            const role = this.roleForEvent(entry.type, verbose);
            if (!role) continue;

            const text = this.extractEventText(entry, verbose);
            if (!text) continue;

            messages.push({
                role,
                content: text,
                timestamp: entry.timestamp,
            });
        }

        return messages;
    }

    async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
        const summaries: SessionSummary[] = [];

        for (const { sessionDir, sessionId } of this.listSessionDirs()) {
            const session = this.readSessionDir(sessionDir, sessionId);
            if (!session) continue;
            if (opts?.cwd !== undefined && session.projectPath !== opts.cwd) continue;

            summaries.push({
                type: this.type,
                sessionId: session.sessionId,
                cwd: session.projectPath,
                firstUserMessage: session.firstUserMessage,
                lastActive: session.lastActive,
                startedAt: session.sessionStart,
                sessionFilePath: session.eventsFilePath,
            });
        }

        return summaries;
    }

    private listSessionDirs(): CopilotSessionDir[] {
        if (!isDirectory(this.sessionStateDir)) return [];

        const sessionDirs: CopilotSessionDir[] = [];
        for (const sessionId of safeReaddir(this.sessionStateDir)) {
            const sessionDir = path.join(this.sessionStateDir, sessionId);
            if (!isDirectory(sessionDir)) continue;

            sessionDirs.push({ sessionDir, sessionId });
        }

        return sessionDirs;
    }

    private discoverActiveLocks(): CopilotLock[] {
        const locks: CopilotLock[] = [];
        for (const { sessionDir, sessionId } of this.listSessionDirs()) {
            for (const entry of safeReaddir(sessionDir)) {
                const match = entry.match(/^inuse\.(\d+)\.lock$/);
                if (!match) continue;

                const pid = Number.parseInt(match[1], 10);
                if (!Number.isFinite(pid)) continue;
                locks.push({ sessionDir, sessionId, pid });
            }
        }

        return locks;
    }

    private readSessionDir(sessionDir: string, fallbackSessionId: string): CopilotSession | null {
        const eventsFilePath = path.join(sessionDir, 'events.jsonl');
        const workspace = this.readWorkspace(path.join(sessionDir, 'workspace.yaml'));
        const entries = this.readEvents(eventsFilePath);
        if (entries.length === 0 && !this.hasWorkspaceMetadata(workspace)) {
            return null;
        }

        const fileStat = safeStat(eventsFilePath);
        const sessionStart = workspace.createdAt || fileStat?.birthtime || new Date();
        const eventSummary = this.summarizeEvents(entries, {
            sessionId: workspace.id || fallbackSessionId,
            projectPath: workspace.cwd || '',
            sessionStart,
            lastActive: workspace.updatedAt || fileStat?.mtime || sessionStart,
            firstUserMessage: '',
            lastText: '',
        });

        const summary = eventSummary.firstUserMessage || eventSummary.lastText || workspace.name || 'Copilot session active';

        return {
            sessionId: eventSummary.sessionId,
            projectPath: eventSummary.projectPath,
            summary: this.truncate(summary, 120),
            sessionStart: eventSummary.sessionStart,
            lastActive: eventSummary.lastActive,
            lastEventType: eventSummary.lastEventType,
            firstUserMessage: eventSummary.firstUserMessage,
            eventsFilePath,
        };
    }

    private readEvents(eventsFilePath: string): CopilotEventEntry[] {
        const content = safeReadFile(eventsFilePath);
        return content === undefined ? [] : this.parseEventLines(content);
    }

    private summarizeEvents(entries: CopilotEventEntry[], initial: CopilotEventSummary): CopilotEventSummary {
        const summary = { ...initial };
        for (const entry of entries) {
            const timestamp = this.parseTimestamp(entry.timestamp);
            if (timestamp) {
                summary.lastActive = timestamp;
            }
            if (entry.type) {
                summary.lastEventType = entry.type;
            }

            if (entry.type === 'session.start') {
                summary.sessionId = entry.data?.sessionId || summary.sessionId;
                summary.projectPath = entry.data?.context?.cwd || summary.projectPath;
                summary.sessionStart = this.parseTimestamp(entry.data?.startTime) || timestamp || summary.sessionStart;
                continue;
            }

            const text = this.extractEventText(entry, false);
            if (!text) continue;

            if (!summary.firstUserMessage && entry.type === 'user.message') {
                summary.firstUserMessage = text;
            }

            if (entry.type === 'user.message' || entry.type === 'assistant.message') {
                summary.lastText = text;
            }
        }

        return summary;
    }

    private hasWorkspaceMetadata(workspace: CopilotWorkspace): boolean {
        return Boolean(
            workspace.id ||
            workspace.cwd ||
            workspace.name ||
            workspace.createdAt ||
            workspace.updatedAt,
        );
    }

    private readWorkspace(filePath: string): CopilotWorkspace {
        const content = safeReadFile(filePath);
        if (content === undefined) return {};

        const values = new Map<string, string>();
        for (const rawLine of content.split('\n')) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;

            const idx = line.indexOf(':');
            if (idx === -1) continue;

            const key = line.slice(0, idx).trim();
            const value = this.stripYamlScalar(line.slice(idx + 1).trim());
            values.set(key, value);
        }

        return {
            id: values.get('id'),
            cwd: values.get('cwd'),
            name: values.get('name'),
            createdAt: this.parseTimestamp(values.get('created_at')) || undefined,
            updatedAt: this.parseTimestamp(values.get('updated_at')) || undefined,
        };
    }

    private stripYamlScalar(value: string): string {
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            return value.slice(1, -1);
        }
        return value;
    }

    private parseEventLines(content: string): CopilotEventEntry[] {
        const entries: CopilotEventEntry[] = [];
        for (const line of content.trim().split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
                entries.push(JSON.parse(trimmed) as CopilotEventEntry);
            } catch {
                continue;
            }
        }
        return entries;
    }

    private roleForEvent(type: string | undefined, verbose: boolean): ConversationMessage['role'] | null {
        if (type === 'user.message') return 'user';
        if (type === 'assistant.message') return 'assistant';
        if (verbose && type !== undefined && CopilotAdapter.VERBOSE_SYSTEM_EVENTS.has(type)) {
            return 'system';
        }
        return null;
    }

    private extractEventText(entry: CopilotEventEntry, verbose: boolean): string {
        const data = entry.data;
        if (!data) return '';

        const raw =
            data.content ||
            data.message ||
            data.text ||
            data.result?.content ||
            data.result?.detailedContent ||
            (verbose ? data.output : '') ||
            '';

        if (typeof raw !== 'string') return '';
        return raw.trim();
    }

    private mapSessionToAgent(session: CopilotSession, proc: ProcessInfo): AgentInfo {
        const projectPath = session.projectPath || proc.cwd || '';
        return {
            name: generateAgentName(projectPath, proc.pid),
            type: this.type,
            status: this.determineStatus(session),
            summary: session.summary || 'Copilot session active',
            pid: proc.pid,
            projectPath,
            sessionId: session.sessionId,
            lastActive: session.lastActive,
            sessionFilePath: session.eventsFilePath,
        };
    }

    private mapProcessOnlyAgent(proc: ProcessInfo): AgentInfo {
        return {
            name: generateAgentName(proc.cwd || '', proc.pid),
            type: this.type,
            status: AgentStatus.RUNNING,
            summary: 'Copilot process running',
            pid: proc.pid,
            projectPath: proc.cwd || '',
            sessionId: `pid-${proc.pid}`,
            lastActive: new Date(),
        };
    }

    private determineStatus(session: CopilotSession): AgentStatus {
        const diffMs = Date.now() - session.lastActive.getTime();
        const diffMinutes = diffMs / 60000;
        if (diffMinutes > CopilotAdapter.IDLE_THRESHOLD_MINUTES) {
            return AgentStatus.IDLE;
        }

        if (session.lastEventType !== undefined && CopilotAdapter.WAITING_EVENTS.has(session.lastEventType)) {
            return AgentStatus.WAITING;
        }

        return AgentStatus.RUNNING;
    }

    private parseTimestamp(value?: string): Date | null {
        if (!value) return null;
        const timestamp = new Date(value);
        return Number.isNaN(timestamp.getTime()) ? null : timestamp;
    }

    private truncate(value: string, maxLength: number): string {
        if (value.length <= maxLength) return value;
        return `${value.slice(0, maxLength - 3)}...`;
    }

    private isCopilotExecutable(command: string): boolean {
        const executable = command.trim().split(/\s+/)[0] || '';
        const base = path.basename(executable).toLowerCase();
        return base === 'copilot' || base === 'copilot.exe';
    }
}
