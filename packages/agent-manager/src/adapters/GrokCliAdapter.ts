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
import { isDirectory, safeReadFile, safeReaddir, safeStat } from '../utils/session.js';
import { generateAgentName } from '../utils/matching.js';

/**
 * Grok Build CLI Adapter
 *
 * Detects running Grok Build CLI agents by:
 * 1. Finding running `grok` processes via shared listAgentProcesses() — Grok is
 *    a native binary at ~/.grok/bin/grok, so argv[0] basename is `grok`.
 * 2. Resolving each live process to its working directory via
 *    ~/.grok/active_sessions.json, which Grok maintains as a list of
 *    { pid, cwd, opened_at } for every running session. The cwd is then encoded
 *    into the session group dir ~/.grok/sessions/<encodeURIComponent(cwd)>/, and
 *    the most recently active session subdirectory is picked from it. The
 *    process cwd from lsof is only a fallback when the PID is not registered.
 * 3. Reading the session transcript from chat_history.jsonl (the authoritative
 *    record of the conversation). The last user turn (the text inside
 *    <user_query>...</user_query>) is the summary; the file's mtime is the last
 *    activity time. summary.json / updates.jsonl are intentionally not used.
 */

const CHAT_HISTORY_FILE = 'chat_history.jsonl';
const ACTIVE_SESSIONS_FILE = 'active_sessions.json';
const CWD_FILE = '.cwd';
const IDLE_THRESHOLD_MINUTES = 5;

/** One entry of ~/.grok/active_sessions.json. */
interface ActiveSessionEntry {
    pid?: number;
    cwd?: string;
    opened_at?: number | string;
}

/** One line of chat_history.jsonl. */
interface ChatRecord {
    type?: string;
    content?: unknown;
}

interface ChatScan {
    messages: ConversationMessage[];
    firstUserMessage?: string;
    lastUserMessage?: string;
    lastRole?: ConversationMessage['role'];
}

/** Parsed state for a single ~/.grok/sessions/<cwd>/<id>/ directory. */
interface GrokSession {
    sessionId: string;
    projectPath: string;
    summary: string;
    sessionStart: Date;
    lastActive: Date;
    firstUserMessage?: string;
    lastUserMessage?: string;
    lastRole?: ConversationMessage['role'];
}

export class GrokCliAdapter implements AgentAdapter {
    readonly type = 'grok_cli' as const;

    private base: string;
    private sessionsDir: string;

    constructor() {
        // GROK_HOME overrides the ~/.grok base directory; sessions live under
        // <base>/sessions/ and the active-session registry at
        // <base>/active_sessions.json.
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.base = process.env.GROK_HOME || path.join(homeDir, '.grok');
        this.sessionsDir = path.join(this.base, 'sessions');
    }

    canHandle(processInfo: ProcessInfo): boolean {
        return this.isGrokExecutable(processInfo.command);
    }

    private isGrokExecutable(command: string): boolean {
        const executable = command.trim().split(/\s+/)[0] || '';
        const base = path.basename(executable).toLowerCase();
        return base === 'grok' || base === 'grok.exe';
    }

    async detectAgents(): Promise<AgentInfo[]> {
        const processes = enrichProcesses(listAgentProcesses('grok'));
        if (processes.length === 0) {
            return [];
        }

        // active_sessions.json is the authoritative pid -> cwd map for live
        // sessions; the lsof-derived process cwd is only a fallback.
        const pidToCwd = this.readActiveSessions();

        const agents: AgentInfo[] = [];
        for (const proc of processes) {
            const cwd = pidToCwd.get(proc.pid) || proc.cwd || '';
            const sessionDir = cwd ? this.latestSessionDir(cwd) : null;
            const session = sessionDir ? this.readSession(sessionDir, cwd) : null;

            if (session && sessionDir) {
                agents.push(this.mapSessionToAgent(session, proc, sessionDir));
            } else {
                agents.push(this.mapProcessOnlyAgent(proc, cwd));
            }
        }

        return agents;
    }

    /**
     * Read ~/.grok/active_sessions.json into a pid -> cwd map. Grok writes one
     * { pid, cwd, opened_at } entry per running session and removes it on exit,
     * so this is the reliable way to learn a live process's working directory.
     */
    private readActiveSessions(): Map<number, string> {
        const map = new Map<number, string>();
        const content = safeReadFile(path.join(this.base, ACTIVE_SESSIONS_FILE));
        if (content === undefined) return map;

        let entries: unknown;
        try {
            entries = JSON.parse(content);
        } catch {
            return map;
        }
        if (!Array.isArray(entries)) return map;

        for (const entry of entries as ActiveSessionEntry[]) {
            if (typeof entry?.pid === 'number' && typeof entry?.cwd === 'string' && entry.cwd) {
                map.set(entry.pid, entry.cwd);
            }
        }
        return map;
    }

    /**
     * Full paths of the session subdirectories directly under a group dir,
     * skipping any non-directory entries. Shared by latestSessionDir() and
     * listSessions() so both enumerate session dirs the same way.
     */
    private listSessionDirs(groupDir: string): string[] {
        return safeReaddir(groupDir)
            .map((sessionId) => path.join(groupDir, sessionId))
            .filter((sessionDir) => isDirectory(sessionDir));
    }

    /**
     * Return the most recently active session subdirectory for a cwd, i.e. the
     * ~/.grok/sessions/<encodeURIComponent(cwd)>/<id>/ whose chat_history.jsonl
     * was written last. Returns null when the group dir or any transcript is
     * missing.
     */
    private latestSessionDir(cwd: string): string | null {
        const groupDir = this.getProjectDir(cwd);
        if (!isDirectory(groupDir)) return null;

        let best: { dir: string; mtimeMs: number } | null = null;
        for (const sessionDir of this.listSessionDirs(groupDir)) {
            const stat = safeStat(path.join(sessionDir, CHAT_HISTORY_FILE));
            if (!stat) continue;
            if (!best || stat.mtimeMs > best.mtimeMs) {
                best = { dir: sessionDir, mtimeMs: stat.mtimeMs };
            }
        }
        return best?.dir ?? null;
    }

    private mapSessionToAgent(session: GrokSession, processInfo: ProcessInfo, sessionDir: string): AgentInfo {
        const projectPath = session.projectPath || processInfo.cwd || '';
        return {
            name: generateAgentName(projectPath, processInfo.pid),
            type: this.type,
            status: this.determineStatus(session),
            summary: session.summary || 'Grok CLI session active',
            pid: processInfo.pid,
            projectPath,
            sessionId: session.sessionId,
            lastActive: session.lastActive,
            sessionFilePath: path.join(sessionDir, CHAT_HISTORY_FILE),
        };
    }

    private mapProcessOnlyAgent(processInfo: ProcessInfo, cwd: string): AgentInfo {
        const projectPath = cwd || processInfo.cwd || '';
        return {
            name: generateAgentName(projectPath, processInfo.pid),
            type: this.type,
            status: AgentStatus.RUNNING,
            summary: 'Grok CLI process running',
            pid: processInfo.pid,
            projectPath,
            sessionId: `pid-${processInfo.pid}`,
            lastActive: new Date(),
        };
    }

    getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
        return this.parseChatHistory(this.resolveChatPath(sessionFilePath), options?.verbose ?? false).messages;
    }

    async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
        if (!isDirectory(this.sessionsDir)) return [];

        const filterCwd = opts?.cwd;
        const summaries: SessionSummary[] = [];

        for (const groupName of safeReaddir(this.sessionsDir)) {
            const groupDir = path.join(this.sessionsDir, groupName);
            if (!isDirectory(groupDir)) continue;

            const decodedCwd = this.decodeGroupCwd(groupName, groupDir);

            for (const sessionDir of this.listSessionDirs(groupDir)) {
                const session = this.readSession(sessionDir, decodedCwd);
                if (!session) continue;

                const cwd = session.projectPath || decodedCwd;
                if (filterCwd !== undefined && cwd !== filterCwd) continue;

                summaries.push({
                    type: this.type,
                    sessionId: session.sessionId,
                    cwd,
                    firstUserMessage: session.firstUserMessage || '',
                    lastActive: session.lastActive,
                    startedAt: session.sessionStart,
                    sessionFilePath: path.join(sessionDir, CHAT_HISTORY_FILE),
                });
            }
        }

        return summaries;
    }

    // --- Session parsing (chat_history.jsonl) ---

    /**
     * Parse a session directory into a {@link GrokSession} from its
     * chat_history.jsonl transcript. Returns null when the transcript is
     * missing — i.e. there is no real session to surface.
     */
    private readSession(sessionDir: string, defaultCwd: string): GrokSession | null {
        const chatPath = path.join(sessionDir, CHAT_HISTORY_FILE);
        const chatStat = safeStat(chatPath);
        if (!chatStat) return null;

        const scan = this.parseChatHistory(chatPath, false);
        const dirStat = safeStat(sessionDir);
        const lastActive = chatStat.mtime;

        return {
            sessionId: path.basename(sessionDir),
            projectPath: defaultCwd || '',
            summary: scan.lastUserMessage || 'Grok CLI session active',
            sessionStart: dirStat?.birthtime || lastActive,
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
    private determineStatus(session: GrokSession): AgentStatus {
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
     * Single pass over chat_history.jsonl. Each line is a
     * { type: 'system' | 'user' | 'assistant', content } record where content is
     * either a string or an array of { type: 'text', text } blocks.
     *
     * Grok wraps the real user prompt in <user_query>...</user_query>; the other
     * user records are context injections (<user_info>, <system-reminder>, ...)
     * and are skipped so the summary is the actual prompt, not boilerplate.
     */
    private parseChatHistory(chatPath: string, verbose: boolean): ChatScan {
        const empty: ChatScan = { messages: [] };
        const content = safeReadFile(chatPath);
        if (content === undefined) return empty;

        const messages: ConversationMessage[] = [];
        let lastRole: ConversationMessage['role'] | undefined;

        for (const line of content.trim().split('\n')) {
            if (!line.trim()) continue;

            let record: ChatRecord;
            try {
                record = JSON.parse(line);
            } catch {
                continue;
            }

            const text = this.extractText(record.content);
            if (record.type === 'user') {
                const query = this.extractUserQuery(text);
                if (query === null) continue; // context injection, not a real prompt
                messages.push({ role: 'user', content: query });
                lastRole = 'user';
            } else if (record.type === 'assistant') {
                if (!text) continue;
                messages.push({ role: 'assistant', content: text });
                lastRole = 'assistant';
            } else if (verbose && record.type === 'system') {
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
        };
    }

    /** Flatten a chat record's content (string or text-block array) to text. */
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
     * Extract the prompt inside <user_query>...</user_query>. Returns null when
     * the record has no such tag (a context injection rather than a prompt).
     */
    private extractUserQuery(text: string): string | null {
        const match = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
        return match ? match[1].trim() : null;
    }

    /** Resolve a session dir or an explicit chat_history.jsonl path to the file. */
    private resolveChatPath(sessionPath: string): string {
        return sessionPath.endsWith('.jsonl') ? sessionPath : path.join(sessionPath, CHAT_HISTORY_FILE);
    }

    private getProjectDir(cwd: string): string {
        return path.join(this.sessionsDir, encodeURIComponent(cwd));
    }

    /**
     * Resolve the working directory a session group dir was created for.
     *
     * The common case is `decodeURIComponent(<group-name>)`. For paths whose
     * encoded form exceeds the filesystem limit Grok uses a slug+hash and records
     * the original path in a `.cwd` file inside the group — prefer that when
     * present.
     */
    private decodeGroupCwd(groupName: string, groupDir: string): string {
        const fromFile = safeReadFile(path.join(groupDir, CWD_FILE));
        if (fromFile !== undefined && fromFile.trim()) return fromFile.trim();
        try {
            return decodeURIComponent(groupName);
        } catch {
            return '';
        }
    }
}
