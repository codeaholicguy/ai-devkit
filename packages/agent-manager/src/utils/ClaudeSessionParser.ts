import * as fs from 'fs';
import * as path from 'path';
import type { ConversationMessage } from '../adapters/AgentAdapter';
import { AgentStatus } from '../adapters/AgentAdapter';

/**
 * Content block within a Claude Code JSONL message entry.
 * Handles text, tool_use, and tool_result block types.
 */
export interface ContentBlock {
    type?: string;
    text?: string;
    content?: string;
    name?: string;
    input?: Record<string, unknown>;
    tool_use_id?: string;
    is_error?: boolean;
}

/**
 * A single line entry in a Claude Code session JSONL file.
 *
 * Each line is an independent JSON object with a type discriminator:
 * - "user" / "assistant" / "system" — conversation turns
 * - "progress" / "thinking" — intermediate agent state
 * - "last-prompt" / "file-history-snapshot" — metadata (not conversation state)
 */
export interface SessionEntry {
    type?: string;
    timestamp?: string;
    cwd?: string;
    message?: {
        content?: string | ContentBlock[];
    };
}

/**
 * Parsed session state extracted from a JSONL file.
 * Aggregates data from all entries into a single summary.
 */
export interface ClaudeSession {
    sessionId: string;
    projectPath: string;
    lastCwd?: string;
    sessionStart: Date;
    lastActive: Date;
    lastEntryType?: string;
    isInterrupted: boolean;
    lastUserMessage?: string;
}

/** Entry types that are metadata, not conversation state. */
const METADATA_ENTRY_TYPES = new Set(['last-prompt', 'file-history-snapshot']);

/**
 * Parses Claude Code session JSONL files into structured data.
 *
 * Session files live at ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
 * and contain one JSON object per line, each representing a conversation
 * event (user turn, assistant response, tool call, etc.).
 */
export class ClaudeSessionParser {
    /**
     * Parse a session JSONL file into a ClaudeSession summary.
     *
     * Iterates all lines to extract: session start time (from first entry),
     * last activity timestamp, last entry type (for status), whether the
     * session was interrupted, and the last meaningful user message.
     *
     * Returns null if the file is unreadable or empty.
     */
    readSession(filePath: string, projectPath: string): ClaudeSession | null {
        const sessionId = path.basename(filePath, '.jsonl');

        let content: string;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        } catch {
            return null;
        }

        const allLines = content.trim().split('\n');
        if (allLines.length === 0) {
            return null;
        }

        const sessionStart = this.parseSessionStart(allLines[0]);

        let lastEntryType: string | undefined;
        let lastActive: Date | undefined;
        let lastCwd: string | undefined;
        let isInterrupted = false;
        let lastUserMessage: string | undefined;

        for (const line of allLines) {
            try {
                const entry: SessionEntry = JSON.parse(line);

                if (entry.timestamp) {
                    const ts = new Date(entry.timestamp);
                    if (!Number.isNaN(ts.getTime())) {
                        lastActive = ts;
                    }
                }

                if (typeof entry.cwd === 'string' && entry.cwd.trim().length > 0) {
                    lastCwd = entry.cwd;
                }

                if (entry.type && !METADATA_ENTRY_TYPES.has(entry.type)) {
                    lastEntryType = entry.type;

                    if (entry.type === 'user') {
                        const msgContent = entry.message?.content;
                        isInterrupted =
                            Array.isArray(msgContent) &&
                            msgContent.some(
                                (c) =>
                                    (c.type === 'text' &&
                                        c.text?.includes('[Request interrupted')) ||
                                    (c.type === 'tool_result' &&
                                        c.content?.includes('[Request interrupted')),
                            );

                        const text = this.extractUserMessageText(msgContent);
                        if (text) {
                            lastUserMessage = text;
                        }
                    } else {
                        isInterrupted = false;
                    }
                }
            } catch {
                continue;
            }
        }

        return {
            sessionId,
            projectPath: projectPath || lastCwd || '',
            lastCwd,
            sessionStart: sessionStart || lastActive || new Date(),
            lastActive: lastActive || new Date(),
            lastEntryType,
            isInterrupted,
            lastUserMessage,
        };
    }

    /**
     * Determine agent status from parsed session state.
     *
     * Status mapping:
     * - "user" + interrupted → WAITING (agent finished, awaiting new input)
     * - "user" + not interrupted → RUNNING (agent is processing)
     * - "progress" / "thinking" → RUNNING
     * - "assistant" → WAITING (agent responded, awaiting user)
     * - "system" → IDLE
     */
    determineStatus(session: ClaudeSession): AgentStatus {
        if (!session.lastEntryType) {
            return AgentStatus.UNKNOWN;
        }

        if (session.lastEntryType === 'user') {
            return session.isInterrupted
                ? AgentStatus.WAITING
                : AgentStatus.RUNNING;
        }

        if (
            session.lastEntryType === 'progress' ||
            session.lastEntryType === 'thinking'
        ) {
            return AgentStatus.RUNNING;
        }

        if (session.lastEntryType === 'assistant') {
            return AgentStatus.WAITING;
        }

        if (session.lastEntryType === 'system') {
            return AgentStatus.IDLE;
        }

        return AgentStatus.UNKNOWN;
    }

    /**
     * Read the full conversation from a session JSONL file.
     *
     * Default mode returns only text content from user/assistant/system messages.
     * Verbose mode also includes tool_use and tool_result blocks.
     */
    getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
        const verbose = options?.verbose ?? false;

        let content: string;
        try {
            content = fs.readFileSync(sessionFilePath, 'utf-8');
        } catch {
            return [];
        }

        const lines = content.trim().split('\n');
        const messages: ConversationMessage[] = [];

        for (const line of lines) {
            let entry: SessionEntry;
            try {
                entry = JSON.parse(line);
            } catch {
                continue;
            }

            const entryType = entry.type;
            if (!entryType || METADATA_ENTRY_TYPES.has(entryType)) continue;
            if (entryType === 'progress' || entryType === 'thinking') continue;

            let role: ConversationMessage['role'];
            if (entryType === 'user') {
                role = 'user';
            } else if (entryType === 'assistant') {
                role = 'assistant';
            } else if (entryType === 'system') {
                role = 'system';
            } else {
                continue;
            }

            const text = this.extractConversationContent(entry.message?.content, role, verbose);
            if (!text) continue;

            messages.push({
                role,
                content: text,
                timestamp: entry.timestamp,
            });
        }

        return messages;
    }

    /**
     * Parse session start time from the first JSONL line.
     *
     * Claude Code may emit a "file-history-snapshot" as the first entry,
     * which stores its timestamp inside "snapshot.timestamp" rather than
     * at the root level.
     */
    private parseSessionStart(firstLine: string): Date | null {
        try {
            const firstEntry = JSON.parse(firstLine);
            const rawTs: string | undefined =
                firstEntry.timestamp || firstEntry.snapshot?.timestamp;
            if (rawTs) {
                const ts = new Date(rawTs);
                if (!Number.isNaN(ts.getTime())) {
                    return ts;
                }
            }
        } catch {
            /* malformed first line */
        }
        return null;
    }

    /**
     * Extract meaningful text from a user message content field.
     *
     * Handles multiple formats:
     * - Plain string content
     * - Array of content blocks (extracts first text block)
     * - Skill slash-commands (<command-message> tags)
     * - Expanded skill content (extracts ARGUMENTS line)
     * - Filters noise messages (interruptions, tool loaded, session continued)
     */
    private extractUserMessageText(
        content: string | Array<{ type?: string; text?: string }> | undefined,
    ): string | undefined {
        if (!content) {
            return undefined;
        }

        let raw: string | undefined;

        if (typeof content === 'string') {
            raw = content.trim();
        } else if (Array.isArray(content)) {
            for (const block of content) {
                if (block.type === 'text' && block.text?.trim()) {
                    raw = block.text.trim();
                    break;
                }
            }
        }

        if (!raw) {
            return undefined;
        }

        if (raw.startsWith('<command-message>')) {
            return this.parseCommandMessage(raw);
        }

        if (raw.startsWith('Base directory for this skill:')) {
            const argsMatch = raw.match(/\nARGUMENTS:\s*(.+)/);
            return argsMatch?.[1]?.trim() || undefined;
        }

        if (isNoiseMessage(raw)) {
            return undefined;
        }

        return raw;
    }

    /**
     * Parse a <command-message> string into "/command args" format.
     */
    private parseCommandMessage(raw: string): string | undefined {
        const nameMatch = raw.match(/<command-name>([^<]+)<\/command-name>/);
        const argsMatch = raw.match(/<command-args>([^<]+)<\/command-args>/);
        const name = nameMatch?.[1]?.trim();
        if (!name) {
            return undefined;
        }
        const args = argsMatch?.[1]?.trim();
        return args ? `${name} ${args}` : name;
    }

    /**
     * Extract displayable content from a message content field for conversation output.
     */
    private extractConversationContent(
        content: string | ContentBlock[] | undefined,
        role: ConversationMessage['role'],
        verbose: boolean,
    ): string | undefined {
        if (!content) return undefined;

        if (typeof content === 'string') {
            const trimmed = content.trim();
            if (role === 'user' && isNoiseMessage(trimmed)) return undefined;
            return trimmed || undefined;
        }

        if (!Array.isArray(content)) return undefined;

        const parts: string[] = [];

        for (const block of content) {
            if (block.type === 'text' && block.text?.trim()) {
                if (role === 'user' && isNoiseMessage(block.text.trim())) continue;
                parts.push(block.text.trim());
            } else if (block.type === 'tool_use' && verbose) {
                const inputSummary = block.input?.file_path || block.input?.pattern || block.input?.command || '';
                parts.push(`[Tool: ${block.name}]${inputSummary ? ' ' + inputSummary : ''}`);
            } else if (block.type === 'tool_result' && verbose) {
                const truncated = truncateToolResult(block.content || '');
                const prefix = block.is_error ? '[Tool Error]' : '[Tool Result]';
                parts.push(`${prefix} ${truncated}`);
            }
        }

        return parts.length > 0 ? parts.join('\n') : undefined;
    }
}

/** Check if a message is noise (not a meaningful user intent). */
function isNoiseMessage(text: string): boolean {
    return (
        text.startsWith('[Request interrupted') ||
        text === 'Tool loaded.' ||
        text.startsWith('This session is being continued')
    );
}

function truncateToolResult(content: string, maxLength = 200): string {
    const firstLine = content.split('\n')[0] || '';
    if (firstLine.length <= maxLength) return firstLine;
    return firstLine.slice(0, maxLength - 3) + '...';
}
