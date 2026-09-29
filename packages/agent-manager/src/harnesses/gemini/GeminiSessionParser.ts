import * as fs from "fs";
import type {
  ConversationMessage,
  ConversationOptions,
  SessionSummary,
} from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import { sliceTail } from "../../utils/jsonlTail.js";
import { safeReadFile, safeStat } from "../../utils/session.js";
import { fileSignature } from "./fileSignature.js";
import { isIdle, parseTimestamp, SUMMARY_MAX_LENGTH, truncate } from "../shared.js";

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

interface CachedParsedSession {
  signature: string;
  session: GeminiSession | null;
}

const SESSION_LOG_EXTENSION = ".jsonl";
/** Parsed sessions are small (summary is truncated); cap entries, not bytes. */
const MAX_CACHED_SESSIONS = 256;

export class GeminiSessionParser {
  private readonly sessionCache = new Map<string, CachedParsedSession>();

  /**
   * Parse session file content into GeminiSession.
   * Uses the given content if available; otherwise reads from disk, reusing
   * the previous result while the file's inode, size and mtime are unchanged.
   */
  parseSession(cachedContent: string | undefined, filePath: string): GeminiSession | null {
    const fileStat = safeStat(filePath);
    if (cachedContent !== undefined) return this.buildSession(cachedContent, filePath, fileStat);

    if (!fileStat) {
      this.sessionCache.delete(filePath);
      return null;
    }

    const signature = fileSignature(fileStat);
    const cached = this.sessionCache.get(filePath);
    if (cached?.signature === signature) return cached.session;

    const content = this.readSessionFile(filePath);
    const session = content === null ? null : this.buildSession(content, filePath, fileStat);
    this.rememberSession(filePath, { signature, session });
    return session;
  }

  private rememberSession(filePath: string, entry: CachedParsedSession): void {
    this.sessionCache.delete(filePath);
    this.sessionCache.set(filePath, entry);
    while (this.sessionCache.size > MAX_CACHED_SESSIONS) {
      const oldest = this.sessionCache.keys().next().value;
      if (oldest === undefined) break;
      this.sessionCache.delete(oldest);
    }
  }

  private buildSession(
    content: string,
    filePath: string,
    fileStat: fs.Stats | undefined,
  ): GeminiSession | null {
    const parsed = this.parseSessionContent(content, filePath);
    if (!parsed?.sessionId) return null;

    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    const lastEntry = messages.length > 0 ? messages[messages.length - 1] : undefined;

    const lastActive =
      parseTimestamp(parsed.lastUpdated) ||
      parseTimestamp(lastEntry?.timestamp) ||
      fileStat?.mtime ||
      new Date();

    const sessionStart = parseTimestamp(parsed.startTime) || lastActive;
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
    if (isIdle(session.lastActive)) {
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
   *
   * `tail` only slices the result: the session is a single JSON document, so
   * it cannot be read from the end and is always parsed in full. Callers that
   * poll (the console preview) rely on their mtime cache to skip re-parses.
   */
  getConversation(sessionFilePath: string, options?: ConversationOptions): ConversationMessage[] {
    const verbose = options?.verbose ?? false;
    const content = safeReadFile(sessionFilePath);
    if (content === undefined) return [];

    const parsed = this.parseSessionContent(content, sessionFilePath);
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

    return sliceTail(messages, options?.tail);
  }

  /**
   * Read a Gemini session JSON file and produce a {@link SessionSummary}.
   * Returns null when the file is unreadable, the JSON doesn't parse,
   * or the body lacks a sessionId.
   */
  fileToSessionSummary(filePath: string): SessionSummary | null {
    const content = safeReadFile(filePath);
    if (content === undefined) return null;

    const parsed = this.parseSessionContent(content, filePath);
    if (!parsed?.sessionId) return null;

    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    const firstUserMessage = this.extractFirstUserMessage(messages);
    const cwd =
      Array.isArray(parsed.directories) && parsed.directories.length > 0
        ? parsed.directories[0]
        : "";

    const stat = safeStat(filePath);
    const lastEntryTimestamp = parseTimestamp(
      messages.length > 0 ? messages[messages.length - 1]?.timestamp : undefined,
    );
    const lastActive =
      parseTimestamp(parsed.lastUpdated) || lastEntryTimestamp || stat?.mtime || new Date();
    const startedAt =
      parseTimestamp(parsed.startTime) || stat?.birthtime || stat?.mtime || lastActive;

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

  /**
   * Parse either session format into the legacy single-document shape:
   * `session-*.json` is one JSON document, `session-*.jsonl` (Gemini CLI
   * 0.46+) is an append-only log replayed by {@link replaySessionLog}.
   */
  private parseSessionContent(content: string, filePath: string): GeminiSessionFile | null {
    return isSessionLogPath(filePath)
      ? this.replaySessionLog(content)
      : this.parseSessionJson(content);
  }

  /**
   * Rebuild a session document from a `.jsonl` log, mirroring Gemini CLI's
   * own loader (`loadConversationRecord`):
   * - a record with a string `id` is a message, upserted by id in place;
   * - `{"$set": {...}}` merges metadata; a `$set.messages` array replaces
   *   every message;
   * - `{"$rewindTo": id}` drops that message and all later ones (all
   *   messages when the id is unknown);
   * - a record with `sessionId` and `projectHash` (line 1) merges metadata.
   * Unknown operators, non-object lines and a torn trailing line (a write
   * in progress) are ignored.
   */
  private replaySessionLog(content: string): GeminiSessionFile | null {
    let metadata: Record<string, unknown> = {};
    const messages = new Map<string, GeminiMessageEntry>();
    const upsertAll = (entries: unknown): void => {
      if (!Array.isArray(entries)) return;
      for (const entry of entries) {
        if (isRecord(entry) && typeof entry.id === "string") messages.set(entry.id, entry);
      }
    };

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      const record = this.parseLogRecord(line);
      if (!record) continue;

      if (typeof record.$rewindTo === "string") {
        this.rewindMessages(messages, record.$rewindTo);
      } else if (typeof record.id === "string") {
        messages.set(record.id, record);
      } else if (isRecord(record.$set)) {
        if (Array.isArray(record.$set.messages)) {
          messages.clear();
          upsertAll(record.$set.messages);
        }
        metadata = { ...metadata, ...record.$set };
      } else if (typeof record.sessionId === "string" && typeof record.projectHash === "string") {
        metadata = { ...metadata, ...record };
        upsertAll(record.messages);
      }
    }

    if (typeof metadata.sessionId !== "string") return null;
    return { ...(metadata as GeminiSessionFile), messages: Array.from(messages.values()) };
  }

  private rewindMessages(messages: Map<string, GeminiMessageEntry>, messageId: string): void {
    if (!messages.has(messageId)) {
      messages.clear();
      return;
    }
    let found = false;
    for (const id of Array.from(messages.keys())) {
      if (id === messageId) found = true;
      if (found) messages.delete(id);
    }
  }

  private parseLogRecord(line: string): Record<string, unknown> | null {
    try {
      const record: unknown = JSON.parse(line);
      return isRecord(record) ? record : null;
    } catch {
      return null;
    }
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
      if (text) return truncate(text, SUMMARY_MAX_LENGTH);
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
}

/** Gemini CLI 0.46+ writes sessions as append-only `.jsonl` logs. */
export function isSessionLogPath(filePath: string): boolean {
  return filePath.endsWith(SESSION_LOG_EXTENSION);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
