/**
 * Gemini CLI Adapter
 *
 * Detects running Gemini CLI agents by:
 * 1. Finding running gemini processes via shared listAgentProcesses()
 * 2. Enriching with CWD and start times via shared enrichProcesses()
 * 3. Discovering session files from ~/.gemini/tmp/<shortId>/chats/session-*.json
 * 4. Matching sessions to processes via shared matchProcessesToSessions()
 *    using sha256(cwd) === session.projectHash as the resolvedCwd source
 * 5. Extracting summary from the most recent user message in the session JSON
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { AgentAdapter, AgentInfo, ProcessInfo, ConversationMessage } from './AgentAdapter';
import { AgentStatus } from './AgentAdapter';
import { listAgentProcesses, enrichProcesses } from '../utils/process';
import type { SessionFile } from '../utils/session';
import { matchProcessesToSessions, generateAgentName } from '../utils/matching';

/**
 * A single Gemini CLI message content part. Mirrors the `{text?: string}`
 * shape that Gemini writes for user message parts (derived from the
 * Gemini API `Content.parts[]` schema). Non-text part variants (data,
 * file, etc.) are preserved via the index signature but ignored by
 * `resolveContent` since the adapter only surfaces human-readable text.
 */
interface GeminiContentPart {
    text?: string;
    [key: string]: unknown;
}

type GeminiMessageContent = string | GeminiContentPart[];

interface GeminiMessageEntry {
    id?: string;
    timestamp?: string;
    type?: string;
    /**
     * Gemini CLI stores two different content shapes depending on the
     * message origin:
     * - `type: "user"` messages carry the raw Part[] from userContent.parts
     *   (e.g. `[{ text: "hello" }]`).
     * - `type: "gemini"` (assistant) messages carry a pre-joined string
     *   built from `consolidatedParts.filter(p => p.text).join('').trim()`.
     * Both forms must be normalized via resolveContent before any string
     * operation is applied.
     */
    content?: GeminiMessageContent;
    displayContent?: GeminiMessageContent;
}

interface GeminiSessionFile {
    sessionId?: string;
    projectHash?: string;
    startTime?: string;
    lastUpdated?: string;
    messages?: GeminiMessageEntry[];
    directories?: string[];
    kind?: string;
}

interface GeminiSession {
    sessionId: string;
    projectPath: string;
    summary: string;
    sessionStart: Date;
    lastActive: Date;
    lastMessageType?: string;
}

export class GeminiCliAdapter implements AgentAdapter {
    readonly type = 'gemini_cli' as const;

    private static readonly IDLE_THRESHOLD_MINUTES = 5;
    private static readonly SESSION_FILE_PREFIX = 'session-';
    private static readonly CHATS_DIR_NAME = 'chats';
    private static readonly TMP_DIR_NAME = 'tmp';

    private geminiTmpDir: string;

    constructor() {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        this.geminiTmpDir = path.join(homeDir, '.gemini', GeminiCliAdapter.TMP_DIR_NAME);
    }

    canHandle(processInfo: ProcessInfo): boolean {
        return this.isGeminiExecutable(processInfo.command);
    }

    /**
     * Detect running Gemini CLI agents.
     *
     * Gemini CLI ships as a Node script (`bundle/gemini.js` with shebang
     * `#!/usr/bin/env node`) — unlike Claude Code (native binary per
     * platform) or Codex CLI (Node wrapper that execs a native Rust
     * binary). The primary running process is therefore the Node runtime
     * itself, and `ps aux` lists it as `node /path/to/gemini ...` with
     * argv[0] = `node`. We scan the Node process pool via the shared
     * helper and keep only those whose command line references the gemini
     * executable or script via isGeminiExecutable().
     */
    async detectAgents(): Promise<AgentInfo[]> {
        const nodeProcesses = enrichProcesses(listAgentProcesses('node'));
        const processes = nodeProcesses.filter((proc) => this.isGeminiExecutable(proc.command));
        if (processes.length === 0) return [];

        const { sessions, contentCache } = this.discoverSessions(processes);
        if (sessions.length === 0) {
            return processes.map((p) => this.mapProcessOnlyAgent(p));
        }

        const matches = matchProcessesToSessions(processes, sessions);
        const matchedPids = new Set(matches.map((m) => m.process.pid));
        const agents: AgentInfo[] = [];

        for (const match of matches) {
            const cachedContent = contentCache.get(match.session.filePath);
            const sessionData = this.parseSession(cachedContent, match.session.filePath);
            if (sessionData) {
                agents.push(this.mapSessionToAgent(sessionData, match.process, match.session.filePath));
            } else {
                matchedPids.delete(match.process.pid);
            }
        }

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
     * Gemini CLI writes sessions to ~/.gemini/tmp/<shortId>/chats/session-*.json
     * where <shortId> is opaque (managed by a project registry). We scan every
     * shortId directory and filter by matching session.projectHash against
     * sha256(process.cwd) to bind each session to a candidate process CWD.
     */
    private discoverSessions(processes: ProcessInfo[]): {
        sessions: SessionFile[];
        contentCache: Map<string, string>;
    } {
        const empty = { sessions: [] as SessionFile[], contentCache: new Map<string, string>() };
        if (!fs.existsSync(this.geminiTmpDir)) return empty;

        const cwdHashMap = this.buildCwdHashMap(processes);
        if (cwdHashMap.size === 0) return empty;

        const contentCache = new Map<string, string>();
        const sessions: SessionFile[] = [];

        let shortIdEntries: string[];
        try {
            shortIdEntries = fs.readdirSync(this.geminiTmpDir);
        } catch {
            return empty;
        }

        for (const shortId of shortIdEntries) {
            const chatsDir = path.join(this.geminiTmpDir, shortId, GeminiCliAdapter.CHATS_DIR_NAME);
            try {
                if (!fs.statSync(chatsDir).isDirectory()) continue;
            } catch {
                continue;
            }

            let chatFiles: string[];
            try {
                chatFiles = fs.readdirSync(chatsDir);
            } catch {
                continue;
            }

            for (const fileName of chatFiles) {
                if (!fileName.startsWith(GeminiCliAdapter.SESSION_FILE_PREFIX) || !fileName.endsWith('.json')) {
                    continue;
                }

                const filePath = path.join(chatsDir, fileName);

                let content: string;
                try {
                    content = fs.readFileSync(filePath, 'utf-8');
                } catch {
                    continue;
                }

                let parsed: GeminiSessionFile;
                try {
                    parsed = JSON.parse(content);
                } catch {
                    continue;
                }

                if (!parsed.projectHash) continue;
                const resolvedCwd = cwdHashMap.get(parsed.projectHash);
                if (!resolvedCwd) continue;

                let birthtimeMs = 0;
                try {
                    birthtimeMs = fs.statSync(filePath).birthtimeMs;
                } catch {
                    continue;
                }

                const sessionId =
                    parsed.sessionId || fileName.replace(/\.json$/, '');

                contentCache.set(filePath, content);
                sessions.push({
                    sessionId,
                    filePath,
                    projectDir: chatsDir,
                    birthtimeMs,
                    resolvedCwd,
                });
            }
        }

        return { sessions, contentCache };
    }

    private buildCwdHashMap(processes: ProcessInfo[]): Map<string, string> {
        const map = new Map<string, string>();
        for (const proc of processes) {
            if (!proc.cwd) continue;
            // Gemini CLI resolves its project root by walking up from the
            // startup directory looking for a `.git` boundary marker. A
            // session's projectHash therefore tracks that ancestor rather
            // than the process' actual CWD. Enumerate every ancestor as a
            // candidate so subdirectory invocations still line up with the
            // session the Gemini process wrote.
            for (const candidate of this.candidateProjectRoots(proc.cwd)) {
                if (!map.has(this.hashProjectRoot(candidate))) {
                    map.set(this.hashProjectRoot(candidate), proc.cwd);
                }
            }
        }
        return map;
    }

    private candidateProjectRoots(cwd: string): string[] {
        const roots: string[] = [];
        let current = path.resolve(cwd);
        let parent = path.dirname(current);
        while (parent !== current) {
            roots.push(current);
            current = parent;
            parent = path.dirname(current);
        }
        roots.push(current);
        return roots;
    }

    private hashProjectRoot(projectRoot: string): string {
        return crypto.createHash('sha256').update(projectRoot).digest('hex');
    }

    /**
     * Parse session file content into GeminiSession.
     * Uses cached content if available, otherwise reads from disk.
     */
    private parseSession(cachedContent: string | undefined, filePath: string): GeminiSession | null {
        let content: string;
        if (cachedContent !== undefined) {
            content = cachedContent;
        } else {
            try {
                content = fs.readFileSync(filePath, 'utf-8');
            } catch {
                return null;
            }
        }

        let parsed: GeminiSessionFile;
        try {
            parsed = JSON.parse(content);
        } catch {
            return null;
        }

        if (!parsed.sessionId) return null;

        const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
        const lastEntry = messages.length > 0 ? messages[messages.length - 1] : undefined;

        let mtime: Date | null = null;
        try {
            mtime = fs.statSync(filePath).mtime;
        } catch {
            mtime = null;
        }

        const lastActive =
            this.parseTimestamp(parsed.lastUpdated) ||
            this.parseTimestamp(lastEntry?.timestamp) ||
            mtime ||
            new Date();

        const sessionStart =
            this.parseTimestamp(parsed.startTime) || lastActive;

        const projectPath =
            Array.isArray(parsed.directories) && parsed.directories.length > 0
                ? parsed.directories[0]
                : '';

        return {
            sessionId: parsed.sessionId,
            projectPath,
            summary: this.extractSummary(messages),
            sessionStart,
            lastActive,
            lastMessageType: lastEntry?.type,
        };
    }

    private mapSessionToAgent(session: GeminiSession, processInfo: ProcessInfo, filePath: string): AgentInfo {
        const projectPath = session.projectPath || processInfo.cwd || '';
        return {
            name: generateAgentName(projectPath, processInfo.pid),
            type: this.type,
            status: this.determineStatus(session),
            summary: session.summary || 'Gemini CLI session active',
            pid: processInfo.pid,
            projectPath,
            sessionId: session.sessionId,
            lastActive: session.lastActive,
            sessionFilePath: filePath,
        };
    }

    private mapProcessOnlyAgent(processInfo: ProcessInfo): AgentInfo {
        return {
            name: generateAgentName(processInfo.cwd || '', processInfo.pid),
            type: this.type,
            status: AgentStatus.RUNNING,
            summary: 'Gemini CLI process running',
            pid: processInfo.pid,
            projectPath: processInfo.cwd || '',
            sessionId: `pid-${processInfo.pid}`,
            lastActive: new Date(),
        };
    }

    private parseTimestamp(value?: string): Date | null {
        if (!value) return null;
        const timestamp = new Date(value);
        return Number.isNaN(timestamp.getTime()) ? null : timestamp;
    }

    private determineStatus(session: GeminiSession): AgentStatus {
        const diffMs = Date.now() - session.lastActive.getTime();
        const diffMinutes = diffMs / 60000;

        if (diffMinutes > GeminiCliAdapter.IDLE_THRESHOLD_MINUTES) {
            return AgentStatus.IDLE;
        }

        if (session.lastMessageType === 'gemini' || session.lastMessageType === 'assistant') {
            return AgentStatus.WAITING;
        }

        return AgentStatus.RUNNING;
    }

    private extractSummary(messages: GeminiMessageEntry[]): string {
        for (let i = messages.length - 1; i >= 0; i--) {
            const entry = messages[i];
            if (entry?.type !== 'user') continue;
            const text = this.messageText(entry).trim();
            if (text) return this.truncate(text, 120);
        }

        return 'Gemini CLI session active';
    }

    /**
     * Normalize an entry's content/displayContent into a plain string.
     * Prefers displayContent when both are present (matches Gemini CLI's
     * own rendering priority for the /chat UI).
     */
    private messageText(entry: GeminiMessageEntry): string {
        const displayText = this.resolveContent(entry.displayContent);
        if (displayText) return displayText;
        return this.resolveContent(entry.content);
    }

    /**
     * Collapse a Gemini message content field into plain text.
     * Accepts either a pre-joined string (assistant turns) or a Part[]
     * list (user turns carrying `[{text: "..."}]`). Non-text part
     * variants (data, file) are dropped since this helper is only used
     * for summary/conversation rendering.
     */
    private resolveContent(content: GeminiMessageContent | undefined): string {
        if (!content) return '';
        if (typeof content === 'string') return content;
        if (!Array.isArray(content)) return '';

        const parts: string[] = [];
        for (const part of content) {
            if (part && typeof part.text === 'string' && part.text) {
                parts.push(part.text);
            }
        }
        return parts.join('');
    }

    private truncate(value: string, maxLength: number): string {
        if (value.length <= maxLength) return value;
        return `${value.slice(0, maxLength - 3)}...`;
    }

    private isGeminiExecutable(command: string): boolean {
        // Accept any token in the command line whose basename matches a
        // known gemini entrypoint. This is intentionally broader than the
        // other adapters' argv[0]-only check because the Node-script
        // distribution puts the real gemini path in argv[1..], not argv[0].
        for (const token of command.trim().split(/\s+/)) {
            const base = path.basename(token).toLowerCase();
            if (base === 'gemini' || base === 'gemini.exe' || base === 'gemini.js') {
                return true;
            }
        }
        return false;
    }

    /**
     * Read the full conversation from a Gemini CLI session JSON file.
     *
     * Gemini sessions store messages in an array with `type` field — typically
     * 'user' or 'gemini' for visible turns, with tool and system entries mixed in.
     */
    getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
        const verbose = options?.verbose ?? false;

        let content: string;
        try {
            content = fs.readFileSync(sessionFilePath, 'utf-8');
        } catch {
            return [];
        }

        let parsed: GeminiSessionFile;
        try {
            parsed = JSON.parse(content);
        } catch {
            return [];
        }

        const messages: ConversationMessage[] = [];
        if (!Array.isArray(parsed.messages)) return messages;

        for (const entry of parsed.messages) {
            const entryType = entry?.type;
            if (!entryType) continue;

            let role: ConversationMessage['role'];
            if (entryType === 'user') {
                role = 'user';
            } else if (entryType === 'gemini' || entryType === 'assistant') {
                role = 'assistant';
            } else if (verbose) {
                role = 'system';
            } else {
                continue;
            }

            const text = this.messageText(entry).trim();
            if (!text) continue;

            messages.push({
                role,
                content: text,
                timestamp: entry.timestamp,
            });
        }

        return messages;
    }
}
