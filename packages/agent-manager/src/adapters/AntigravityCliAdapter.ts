import * as path from 'path';
import type {
    AgentAdapter,
    AgentInfo,
    ProcessInfo,
    ConversationMessage,
    SessionSummary,
    ListSessionsOptions,
} from './AgentAdapter.js';
import { AgentStatus } from './AgentAdapter.js';
import { listAgentProcesses, enrichProcesses } from '../utils/process.js';
import { safeReadFile, safeStat } from '../utils/session.js';
import { generateAgentName } from '../utils/matching.js';

/**
 * Antigravity CLI Adapter
 *
 * Detects running Antigravity CLI agents (Google's Gemini-family `agy` CLI) by:
 * 1. Finding running `agy` processes via shared listAgentProcesses() — Antigravity
 *    ships a native binary (argv[0] basename `agy`).
 * 2. Resolving each live process to its conversation via
 *    ~/.gemini/antigravity-cli/cache/last_conversations.json, which the CLI
 *    maintains as a `{ <cwd>: <conversationId> }` map of the current conversation
 *    per workspace. The process cwd is the join key.
 * 3. Reading the transcript from
 *    brain/<conversationId>/.system_generated/logs/transcript.jsonl. User turns are
 *    USER_INPUT records (prompt inside <USER_REQUEST>...</USER_REQUEST>) and the
 *    model's reply is a PLANNER_RESPONSE record; tool calls (RUN_COMMAND, ...) are
 *    skipped. The last user turn is the summary; each record's created_at gives the
 *    last-activity time.
 *
 * This is the runtime/agent side of Antigravity; it is independent of the
 * `antigravity` environment (which configures the Antigravity IDE), the same way
 * GeminiCliAdapter is independent of the `gemini` environment.
 */

const REGISTRY_FILE = path.join('cache', 'last_conversations.json');
const BRAIN_DIR = 'brain';
const TRANSCRIPT_REL = path.join('.system_generated', 'logs', 'transcript.jsonl');
const IDLE_THRESHOLD_MINUTES = 5;

/** One line of transcript.jsonl. */
interface TranscriptRecord {
    source?: string;
    type?: string;
    created_at?: string;
    content?: unknown;
}

interface TranscriptScan {
    messages: ConversationMessage[];
    firstUserMessage?: string;
    lastUserMessage?: string;
    lastRole?: ConversationMessage['role'];
    lastActive?: Date;
}

/** Parsed state for a single conversation. */
interface AntigravitySession {
    sessionId: string;
    projectPath: string;
    summary: string;
    sessionStart: Date;
    lastActive: Date;
    firstUserMessage?: string;
    lastUserMessage?: string;
    lastRole?: ConversationMessage['role'];
}

export class AntigravityCliAdapter implements AgentAdapter {
    readonly type = 'antigravity_cli' as const;

    private base: string;

    constructor() {
        // ANTIGRAVITY_CLI_HOME overrides the ~/.gemini/antigravity-cli base dir.
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.base = process.env.ANTIGRAVITY_CLI_HOME || path.join(homeDir, '.gemini', 'antigravity-cli');
    }

    canHandle(processInfo: ProcessInfo): boolean {
        return this.isAgyExecutable(processInfo.command);
    }

    private isAgyExecutable(command: string): boolean {
        const executable = command.trim().split(/\s+/)[0] || '';
        const base = path.basename(executable).toLowerCase();
        return base === 'agy' || base === 'agy.exe';
    }

    async detectAgents(): Promise<AgentInfo[]> {
        const processes = enrichProcesses(listAgentProcesses('agy'));
        if (processes.length === 0) {
            return [];
        }

        // last_conversations.json maps a workspace cwd to its current
        // conversation id; the live process cwd is the join key.
        const cwdToConversation = this.readRegistry();

        const agents: AgentInfo[] = [];
        for (const proc of processes) {
            const cwd = proc.cwd || '';
            const conversationId = cwd ? cwdToConversation.get(cwd) : undefined;
            const session = conversationId ? this.readSession(conversationId, cwd) : null;

            if (session) {
                agents.push(this.mapSessionToAgent(session, proc));
            } else {
                agents.push(this.mapProcessOnlyAgent(proc, cwd));
            }
        }

        return agents;
    }

    /**
     * Read cache/last_conversations.json into a cwd -> conversationId map. The
     * CLI rewrites this as the current conversation per workspace changes.
     */
    private readRegistry(): Map<string, string> {
        const map = new Map<string, string>();
        const content = safeReadFile(path.join(this.base, REGISTRY_FILE));
        if (content === undefined) return map;

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch {
            return map;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return map;

        for (const [cwd, conversationId] of Object.entries(parsed as Record<string, unknown>)) {
            if (cwd && typeof conversationId === 'string' && conversationId) {
                map.set(cwd, conversationId);
            }
        }
        return map;
    }

    private transcriptPath(conversationId: string): string {
        return path.join(this.base, BRAIN_DIR, conversationId, TRANSCRIPT_REL);
    }

    private mapSessionToAgent(session: AntigravitySession, processInfo: ProcessInfo): AgentInfo {
        const projectPath = session.projectPath || processInfo.cwd || '';
        return {
            name: generateAgentName(projectPath, processInfo.pid),
            type: this.type,
            status: this.determineStatus(session),
            summary: session.summary || 'Antigravity CLI session active',
            pid: processInfo.pid,
            projectPath,
            sessionId: session.sessionId,
            lastActive: session.lastActive,
            sessionFilePath: this.transcriptPath(session.sessionId),
        };
    }

    private mapProcessOnlyAgent(processInfo: ProcessInfo, cwd: string): AgentInfo {
        const projectPath = cwd || processInfo.cwd || '';
        return {
            name: generateAgentName(projectPath, processInfo.pid),
            type: this.type,
            status: AgentStatus.RUNNING,
            summary: 'Antigravity CLI process running',
            pid: processInfo.pid,
            projectPath,
            sessionId: `pid-${processInfo.pid}`,
            lastActive: new Date(),
        };
    }

    getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
        return this.parseTranscript(this.resolveTranscriptPath(sessionFilePath), options?.verbose ?? false).messages;
    }

    async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
        const filterCwd = opts?.cwd;
        const summaries: SessionSummary[] = [];

        for (const [cwd, conversationId] of this.readRegistry()) {
            if (filterCwd !== undefined && cwd !== filterCwd) continue;

            const session = this.readSession(conversationId, cwd);
            if (!session) continue;

            summaries.push({
                type: this.type,
                sessionId: session.sessionId,
                cwd: session.projectPath || cwd,
                firstUserMessage: session.firstUserMessage || '',
                lastActive: session.lastActive,
                startedAt: session.sessionStart,
                sessionFilePath: this.transcriptPath(conversationId),
            });
        }

        return summaries;
    }

    // --- Session parsing (transcript.jsonl) ---

    /**
     * Parse a conversation into an {@link AntigravitySession} from its
     * transcript.jsonl. Returns null when the transcript is missing — i.e. there
     * is no real session to surface.
     */
    private readSession(conversationId: string, defaultCwd: string): AntigravitySession | null {
        const transcriptPath = this.transcriptPath(conversationId);
        const stat = safeStat(transcriptPath);
        if (!stat) return null;

        const scan = this.parseTranscript(transcriptPath, false);
        const lastActive = scan.lastActive || stat.mtime;

        return {
            sessionId: conversationId,
            projectPath: defaultCwd || '',
            summary: scan.lastUserMessage || 'Antigravity CLI session active',
            sessionStart: stat.birthtime || lastActive,
            lastActive,
            firstUserMessage: scan.firstUserMessage,
            lastUserMessage: scan.lastUserMessage,
            lastRole: scan.lastRole,
        };
    }

    /**
     * Determine agent status from parsed session state.
     *
     * - past the idle threshold → IDLE
     * - last transcript turn is an assistant message → WAITING (awaiting user)
     * - otherwise (last turn was a user message, or unknown) → RUNNING
     */
    private determineStatus(session: AntigravitySession): AgentStatus {
        const diffMinutes = (Date.now() - session.lastActive.getTime()) / 60000;
        if (diffMinutes > IDLE_THRESHOLD_MINUTES) {
            return AgentStatus.IDLE;
        }
        if (session.lastRole === 'assistant') {
            return AgentStatus.WAITING;
        }
        return AgentStatus.RUNNING;
    }

    /**
     * Single pass over transcript.jsonl. Each line is a
     * { source, type, created_at, content } record. User turns are
     * `type: 'USER_INPUT'` with the real prompt wrapped in
     * <USER_REQUEST>...</USER_REQUEST>; the model's reply is `type:
     * 'PLANNER_RESPONSE'`. Other MODEL records (tool calls like RUN_COMMAND) and
     * SYSTEM records (conversation history, checkpoints) are execution detail and
     * are skipped unless verbose.
     */
    private parseTranscript(transcriptPath: string, verbose: boolean): TranscriptScan {
        const empty: TranscriptScan = { messages: [] };
        const content = safeReadFile(transcriptPath);
        if (content === undefined) return empty;

        const messages: ConversationMessage[] = [];
        let lastRole: ConversationMessage['role'] | undefined;
        let lastActive: Date | undefined;

        for (const line of content.trim().split('\n')) {
            if (!line.trim()) continue;

            let record: TranscriptRecord;
            try {
                record = JSON.parse(line);
            } catch {
                continue;
            }

            const at = this.parseTimestamp(record.created_at);
            if (at && (!lastActive || at.getTime() > lastActive.getTime())) lastActive = at;

            const text = this.extractText(record.content);
            if (record.type === 'USER_INPUT') {
                const request = this.extractUserRequest(text);
                if (request === null) continue; // not a real prompt
                messages.push({ role: 'user', content: request });
                lastRole = 'user';
            } else if (record.type === 'PLANNER_RESPONSE') {
                // The model's user-facing reply. Other MODEL records (tool calls
                // such as RUN_COMMAND, empty planning steps) are execution detail,
                // not conversation, so they are excluded from the normal view.
                if (!text) continue;
                messages.push({ role: 'assistant', content: text });
                lastRole = 'assistant';
            } else if (verbose) {
                // Tool calls (MODEL/RUN_COMMAND, ...) and SYSTEM records surface
                // only in verbose mode.
                if (!text) continue;
                messages.push({ role: 'system', content: text });
            }
        }

        const userTurns = messages.filter((m) => m.role === 'user');
        return {
            messages,
            firstUserMessage: userTurns[0]?.content,
            lastUserMessage: userTurns[userTurns.length - 1]?.content,
            lastRole,
            lastActive,
        };
    }

    /** Flatten a transcript record's content (string or text-block array) to text. */
    private extractText(content: unknown): string {
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content
                .map((block) =>
                    block && typeof block === 'object' && typeof (block as { text?: unknown }).text === 'string'
                        ? (block as { text: string }).text
                        : '',
                )
                .join('');
        }
        return '';
    }

    /**
     * Extract the prompt inside <USER_REQUEST>...</USER_REQUEST>. Returns null when
     * the record has no such tag (context injection rather than a prompt). Falls
     * back to the trimmed text when a USER_INPUT record has no wrapper.
     */
    private extractUserRequest(text: string): string | null {
        const match = text.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
        if (match) return match[1].trim();
        const trimmed = text.trim();
        return trimmed ? trimmed : null;
    }

    /** Resolve a conversation dir, transcript path, or bare id to the transcript file. */
    private resolveTranscriptPath(sessionPath: string): string {
        if (sessionPath.endsWith('.jsonl')) return sessionPath;
        // A bare conversation id (no separator) resolves under the brain dir.
        if (!sessionPath.includes(path.sep)) return this.transcriptPath(sessionPath);
        return path.join(sessionPath, TRANSCRIPT_REL);
    }

    private parseTimestamp(value?: string): Date | null {
        if (!value) return null;
        const ts = new Date(value);
        return Number.isNaN(ts.getTime()) ? null : ts;
    }
}
