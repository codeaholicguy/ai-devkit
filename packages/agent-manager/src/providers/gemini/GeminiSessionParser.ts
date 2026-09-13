import * as fs from "fs";
import type { ConversationMessage, SessionSummary } from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import { safeReadFile, safeStat } from "../../utils/session.js";

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

export interface GeminiMessageEntry {
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

export interface GeminiSessionFile {
  sessionId?: string;
  projectHash?: string;
  startTime?: string;
  lastUpdated?: string;
  messages?: GeminiMessageEntry[];
  directories?: string[];
  kind?: string;
}

export interface GeminiSession {
  sessionId: string;
  projectPath: string;
  summary: string;
  sessionStart: Date;
  lastActive: Date;
  lastMessageType?: string;
}

const IDLE_THRESHOLD_MINUTES = 5;

export class GeminiSessionParser {
  /**
   * Parse session file content into GeminiSession.
   * Uses cached content if available, otherwise reads from disk.
   */
  parseSession(cachedContent: string | undefined, filePath: string): GeminiSession | null {
    const content = cachedContent ?? this.readSessionFile(filePath);
    if (content === null) return null;

    const parsed = this.parseSessionJson(content);
    if (!parsed?.sessionId) return null;

    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    const lastEntry = messages.length > 0 ? messages[messages.length - 1] : undefined;
    const fileStat = safeStat(filePath);

    const lastActive =
      this.parseTimestamp(parsed.lastUpdated) ||
      this.parseTimestamp(lastEntry?.timestamp) ||
      fileStat?.mtime ||
      new Date();

    const sessionStart = this.parseTimestamp(parsed.startTime) || lastActive;
    const projectPath =
      Array.isArray(parsed.directories) && parsed.directories.length > 0
        ? parsed.directories[0]
        : "";

    return {
      sessionId: parsed.sessionId,
      projectPath,
      summary: this.extractSummary(messages),
      sessionStart,
      lastActive,
      lastMessageType: lastEntry?.type,
    };
  }

  determineStatus(session: GeminiSession): AgentStatus {
    const diffMs = Date.now() - session.lastActive.getTime();
    const diffMinutes = diffMs / 60000;

    if (diffMinutes > IDLE_THRESHOLD_MINUTES) {
      return AgentStatus.IDLE;
    }

    if (session.lastMessageType === "gemini" || session.lastMessageType === "assistant") {
      return AgentStatus.WAITING;
    }

    return AgentStatus.RUNNING;
  }

  /**
   * Read the full conversation from a Gemini CLI session JSON file.
   *
   * Gemini sessions store messages in an array with `type` field — typically
   * 'user' or 'gemini' for visible turns, with tool and system entries mixed in.
   */
  getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
    const verbose = options?.verbose ?? false;
    const content = safeReadFile(sessionFilePath);
    if (content === undefined) return [];

    const parsed = this.parseSessionJson(content);
    if (!Array.isArray(parsed?.messages)) return [];

    const messages: ConversationMessage[] = [];
    for (const entry of parsed.messages) {
      const role = this.roleForEntry(entry?.type, verbose);
      if (!role) continue;

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

  /**
   * Read a Gemini session JSON file and produce a {@link SessionSummary}.
   * Returns null when the file is unreadable, the JSON doesn't parse,
   * or the body lacks a sessionId.
   */
  fileToSessionSummary(filePath: string): SessionSummary | null {
    const content = safeReadFile(filePath);
    if (content === undefined) return null;

    const parsed = this.parseSessionJson(content);
    if (!parsed?.sessionId) return null;

    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    const firstUserMessage = this.extractFirstUserMessage(messages);
    const cwd =
      Array.isArray(parsed.directories) && parsed.directories.length > 0
        ? parsed.directories[0]
        : "";

    const stat = safeStat(filePath);
    const lastEntryTimestamp = this.parseTimestamp(
      messages.length > 0 ? messages[messages.length - 1]?.timestamp : undefined,
    );
    const lastActive =
      this.parseTimestamp(parsed.lastUpdated) || lastEntryTimestamp || stat?.mtime || new Date();
    const startedAt =
      this.parseTimestamp(parsed.startTime) || stat?.birthtime || stat?.mtime || lastActive;

    return {
      type: "gemini_cli",
      sessionId: parsed.sessionId,
      cwd,
      firstUserMessage,
      lastActive,
      startedAt,
      sessionFilePath: filePath,
    };
  }

  private parseSessionJson(content: string): GeminiSessionFile | null {
    try {
      return JSON.parse(content) as GeminiSessionFile;
    } catch {
      return null;
    }
  }

  private readSessionFile(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  private roleForEntry(
    entryType: string | undefined,
    verbose: boolean,
  ): ConversationMessage["role"] | null {
    if (entryType === "user") return "user";
    if (entryType === "gemini" || entryType === "assistant") return "assistant";
    if (verbose && entryType) return "system";
    return null;
  }

  private extractSummary(messages: GeminiMessageEntry[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const entry = messages[i];
      if (entry?.type !== "user") continue;
      const text = this.messageText(entry).trim();
      if (text) return this.truncate(text, 120);
    }

    return "Gemini CLI session active";
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
    if (!content) return "";
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";

    const parts: string[] = [];
    for (const part of content) {
      if (part && typeof part.text === "string" && part.text) {
        parts.push(part.text);
      }
    }
    return parts.join("");
  }

  private extractFirstUserMessage(messages: GeminiMessageEntry[]): string {
    for (const entry of messages) {
      if (entry?.type !== "user") continue;
      const text = this.messageText(entry).trim();
      if (text) return text;
    }
    return "";
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
}
