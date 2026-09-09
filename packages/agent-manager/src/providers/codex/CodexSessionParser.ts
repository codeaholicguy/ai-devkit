import * as fs from 'fs';
import type { ConversationMessage, SessionSummary } from '../../adapters/AgentAdapter.js';
import { AgentStatus } from '../../adapters/AgentAdapter.js';
import { safeReadFile, safeStat } from '../../utils/session.js';

export interface CodexEventEntry {
    timestamp?: string;
    type?: string;
    payload?: {
        type?: string;
        message?: string;
        id?: string;
        cwd?: string;
        timestamp?: string;
        role?: string;
        content?: CodexContent[];
        item?: CodexItem;
        turn_id?: string;
        internal_chat_message_metadata_passthrough?: {
            turn_id?: string;
        };
    };
}

export interface CodexContent {
    type?: string;
    text?: string;
}

export interface CodexItem {
    type?: string;
    content?: string | CodexContent[];
}

export interface CodexSession {
    sessionId: string;
    projectPath: string;
    summary: string;
    sessionStart: Date;
    lastActive: Date;
    lastPayloadType?: string;
}

const IDLE_THRESHOLD_MINUTES = 5;

export class CodexSessionParser {
    readSession(filePath: string, cachedContent?: string): CodexSession | null {
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

        const allLines = content.trim().split('\n');
        if (!allLines[0]) return null;

        let metaEntry: CodexEventEntry;
        try {
            metaEntry = JSON.parse(allLines[0]);
        } catch {
            return null;
        }

        if (metaEntry.type !== 'session_meta' || !metaEntry.payload?.id) {
            return null;
        }

        const entries: CodexEventEntry[] = [];
        for (const line of allLines) {
            try {
                entries.push(JSON.parse(line));
            } catch {
                continue;
            }
        }

        const lastEntry = this.findLastEventEntry(entries);
        const lastPayloadType = lastEntry ? this.normalizedPayloadType(lastEntry) : undefined;

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

    determineStatus(session: CodexSession): AgentStatus {
        const diffMs = Date.now() - session.lastActive.getTime();
        const diffMinutes = diffMs / 60000;

        if (diffMinutes > IDLE_THRESHOLD_MINUTES) {
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

    getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
        const verbose = options?.verbose ?? false;

        const content = safeReadFile(sessionFilePath);
        if (content === undefined) return [];

        const lines = content.trim().split('\n');
        const entries: CodexEventEntry[] = [];
        const messages: ConversationMessage[] = [];

        for (const line of lines) {
            try {
                entries.push(JSON.parse(line));
            } catch {
                continue;
            }
        }

        const responseItemMirrorKeys = new Set<string>();
        for (const entry of entries) {
            if (entry.type !== 'response_item') continue;

            const message = this.toConversationMessage(entry, verbose);
            const mirrorKey = message ? this.mirroredMessageKey(entry, message) : null;
            if (mirrorKey) responseItemMirrorKeys.add(mirrorKey);
        }

        for (const entry of entries) {
            const message = this.toConversationMessage(entry, verbose);
            if (!message) continue;

            const mirrorKey = this.mirroredMessageKey(entry, message);
            if (
                entry.type === 'event_msg' &&
                mirrorKey &&
                responseItemMirrorKeys.has(mirrorKey)
            ) {
                continue;
            }

            messages.push(message);
        }

        return messages;
    }

    fileToSessionSummary(filePath: string): SessionSummary | null {
        const content = safeReadFile(filePath);
        if (content === undefined) return null;

        const allLines = content.trim().split('\n');
        if (!allLines[0]) return null;

        let metaEntry: CodexEventEntry;
        try {
            metaEntry = JSON.parse(allLines[0]);
        } catch {
            return null;
        }

        if (metaEntry.type !== 'session_meta' || !metaEntry.payload?.id) {
            return null;
        }

        let firstUserMessage = '';
        let lastTimestamp: Date | null = null;

        for (let i = 1; i < allLines.length; i++) {
            let entry: CodexEventEntry;
            try {
                entry = JSON.parse(allLines[i]);
            } catch {
                continue;
            }

            const ts = this.parseTimestamp(entry.timestamp);
            if (ts) lastTimestamp = ts;

            if (!firstUserMessage) {
                const message = this.toConversationMessage(entry, false);
                const content = message?.content.trim() ?? '';
                if (message?.role === 'user' && content.length > 0 && !this.isSyntheticUserMessage(content)) {
                    firstUserMessage = content;
                }
            }
        }

        const stat = safeStat(filePath);

        const startedAt =
            this.parseTimestamp(metaEntry.payload.timestamp) ||
            lastTimestamp ||
            stat?.birthtime ||
            stat?.mtime ||
            new Date();
        const lastActive = lastTimestamp || startedAt;

        return {
            type: 'codex',
            sessionId: metaEntry.payload.id,
            cwd: metaEntry.payload.cwd || '',
            firstUserMessage,
            lastActive,
            startedAt,
            sessionFilePath: filePath,
        };
    }

    parseTimestamp(value?: string): Date | null {
        if (!value) return null;
        const timestamp = new Date(value);
        return Number.isNaN(timestamp.getTime()) ? null : timestamp;
    }

    parseMetaTimestampMs(value?: string): number | null {
        if (typeof value !== 'string') return null;

        const timestamp = this.parseTimestamp(value);
        if (!timestamp) return null;

        const timestampMs = timestamp.getTime();
        return Number.isFinite(timestampMs) ? timestampMs : null;
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

    private extractSummary(entries: CodexEventEntry[]): string {
        for (let i = entries.length - 1; i >= 0; i--) {
            const message = this.extractEntryText(entries[i]);
            if (message) return this.truncate(message, 120);
        }

        return 'Codex session active';
    }

    private normalizedPayloadType(entry: CodexEventEntry): string | undefined {
        const payloadType = entry.payload?.type;

        if (entry.type === 'response_item' && payloadType === 'message') {
            if (entry.payload?.role === 'assistant') return 'agent_message';
            if (entry.payload?.role === 'user') return 'user_message';
            return payloadType;
        }

        if (entry.type === 'event_msg' && payloadType === 'item_completed') {
            const itemType = entry.payload?.item?.type;
            if (itemType === 'AgentMessage') return 'agent_message';
            if (itemType === 'UserMessage') return 'user_message';
            return itemType ?? payloadType;
        }

        return payloadType;
    }

    private extractEntryText(entry: CodexEventEntry | undefined): string {
        if (!entry) return '';

        const legacyMessage = entry.payload?.message;
        if (typeof legacyMessage === 'string' && legacyMessage.trim().length > 0) {
            return legacyMessage.trim();
        }

        const conversationMessage = this.toConversationMessage(entry, false);
        return conversationMessage?.content.trim() ?? '';
    }

    private truncate(value: string, maxLength: number): string {
        if (value.length <= maxLength) return value;
        return `${value.slice(0, maxLength - 3)}...`;
    }

    private toConversationMessage(entry: CodexEventEntry, verbose: boolean): ConversationMessage | null {
        if (entry.type === 'session_meta') return null;

        const payloadType = entry.payload?.type;
        if (entry.type === 'response_item' && payloadType === 'message') {
            const role = this.mapCodexRole(entry.payload?.role, verbose);
            const text = this.extractContentText(entry.payload?.content);
            if (!role || !text) return null;

            return { role, content: text, timestamp: entry.timestamp };
        }

        if (entry.type === 'event_msg' && payloadType === 'item_completed') {
            const item = entry.payload?.item;
            const role = this.mapCodexItemRole(item?.type, verbose);
            const text = this.extractContentText(item?.content);
            if (!role || !text) return null;

            return { role, content: text, timestamp: entry.timestamp };
        }

        if (!payloadType) return null;

        let role: ConversationMessage['role'];
        if (payloadType === 'user_message') {
            role = 'user';
        } else if (payloadType === 'agent_message' || payloadType === 'task_complete') {
            role = 'assistant';
        } else if (verbose) {
            role = 'system';
        } else {
            return null;
        }

        const text = entry.payload?.message?.trim();
        if (!text) return null;

        return { role, content: text, timestamp: entry.timestamp };
    }

    private mapCodexRole(role: string | undefined, verbose: boolean): ConversationMessage['role'] | null {
        if (role === 'user') return 'user';
        if (role === 'assistant') return 'assistant';
        return verbose ? 'system' : null;
    }

    private mapCodexItemRole(itemType: string | undefined, verbose: boolean): ConversationMessage['role'] | null {
        if (itemType === 'AgentMessage') return 'assistant';
        if (itemType === 'UserMessage') return 'user';
        return verbose ? 'system' : null;
    }

    private mirroredMessageKey(entry: CodexEventEntry, message: ConversationMessage): string | null {
        const turnId =
            entry.payload?.turn_id ||
            entry.payload?.internal_chat_message_metadata_passthrough?.turn_id;

        if (!turnId) return null;
        return `${turnId}\0${message.role}\0${message.content}`;
    }

    private extractContentText(content: string | CodexContent[] | undefined): string {
        if (typeof content === 'string') return content.trim();
        if (!Array.isArray(content)) return '';

        return content
            .map((part) => part.text)
            .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
            .map((text) => text.trim())
            .join('\n')
            .trim();
    }

    private isSyntheticUserMessage(content: string): boolean {
        return content.startsWith('<environment_context>') && content.includes('</environment_context>');
    }
}
