import * as fs from "fs";
import type {
  ConversationMessage,
  ConversationOptions,
  SessionSummary,
} from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import { JsonlTailReader, normalizeTail, type JsonlTailSource } from "../../utils/jsonlTail.js";
import { safeReadFile, safeStat } from "../../utils/session.js";
import {
  IncrementalJsonlSummary,
  reduceJsonlContent,
  type JsonlSummaryBounds,
  type JsonlSummaryReducer,
} from "../../utils/IncrementalJsonlSummary.js";
import { isIdle, parseTimestamp, SUMMARY_MAX_LENGTH, truncate } from "../shared.js";

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

/** O(1) running summary folded from session entries; `toSession` builds a `CodexSession`. */
interface CodexSummaryState {
  seenFirstLine: boolean;
  /** Set only when the first line is a valid `session_meta` entry. */
  meta?: { id: string; cwd?: string; timestamp?: string };
  lastEntryTimestamp?: string;
  lastPayloadType?: string;
  /** Truncated text of the last entry with displayable content. */
  summary?: string;
}

/** A candidate conversation message plus what is needed to de-duplicate mirrors. */
interface CodexConversationItem {
  entryType?: string;
  mirrorKey: string | null;
  message: ConversationMessage;
}

const MIRROR_OVERSCAN = 8;

export interface CodexSessionParserOptions {
  /** Cold-start scan bounds for `readSessionIncremental` (see IncrementalJsonlSummary). */
  summaryBounds?: JsonlSummaryBounds | false;
}

export class CodexSessionParser {
  /** Incremental reader backing `getConversation({ tail })`. */
  private readonly tailReader = new JsonlTailReader();

  private readonly sessionCache: IncrementalJsonlSummary<CodexSummaryState>;

  constructor(options: CodexSessionParserOptions = {}) {
    this.sessionCache = new IncrementalJsonlSummary(this.summaryReducer, {
      bounds: options.summaryBounds,
    });
  }

  readSession(filePath: string, cachedContent?: string): CodexSession | null {
    let content: string;
    if (cachedContent !== undefined) {
      content = cachedContent;
    } else {
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        return null;
      }
    }

    return this.toSession(
      reduceJsonlContent(this.summaryReducer, content),
      () => fs.statSync(filePath).mtime,
    );
  }

  /**
   * Same result as `readSession`, but backed by a per-instance incremental
   * cache so repeated refreshes only parse bytes appended since the last call.
   * Call `pruneSessionCache()` once per refresh to evict files no longer read.
   *
   * The first read of a large transcript is a bounded head + tail scan (see
   * `summaryReducer.skip`); fields whose entries lie only in the skipped
   * middle fall back to their defaults instead of forcing a full parse.
   */
  readSessionIncremental(filePath: string): CodexSession | null {
    const result = this.sessionCache.read(filePath);
    return result ? this.toSession(result.state, () => result.mtime) : null;
  }

  /** Evict cached summaries for files not read since the previous prune. */
  pruneSessionCache(): void {
    this.sessionCache.prune();
  }

  /**
   * Fold one JSONL entry into the O(1) session summary. The first line must
   * be a `session_meta` entry; the rest track the last typed entry and the
   * last entry with displayable text.
   *
   * `skip` (bounded cold start) keeps the head's `session_meta` and clears the
   * "latest" fields, so those come from the tail only. Without a typed tail
   * entry lastActive falls back to the meta timestamp, then the file mtime;
   * without tail text the summary is the "Codex session active" default. A
   * `session_meta` line longer than the head window yields no session (null).
   */
  private readonly summaryReducer: JsonlSummaryReducer<CodexSummaryState> = {
    initial: () => ({ seenFirstLine: false }),
    reduce: (state, value) => {
      const entry = value && typeof value === "object" ? (value as CodexEventEntry) : undefined;
      const next: CodexSummaryState = { ...state, seenFirstLine: true };

      if (!state.seenFirstLine) {
        if (entry?.type === "session_meta" && entry.payload?.id) {
          next.meta = {
            id: entry.payload.id,
            cwd: entry.payload.cwd,
            timestamp: entry.payload.timestamp,
          };
        }
      }
      // Without a leading session_meta the file is not a Codex session; skip the work
      if (!entry || !next.meta) return next;

      if (typeof entry.type === "string") {
        next.lastEntryTimestamp = entry.timestamp;
        next.lastPayloadType = this.normalizedPayloadType(entry);
      }

      const text = this.extractEntryText(entry);
      if (text) next.summary = truncate(text, SUMMARY_MAX_LENGTH);

      return next;
    },
    skip: (state) => ({ seenFirstLine: true, meta: state.meta }),
  };

  private toSession(state: CodexSummaryState, fileMtime: () => Date): CodexSession | null {
    const meta = state.meta;
    if (!meta) return null;

    const lastActive =
      parseTimestamp(state.lastEntryTimestamp) || parseTimestamp(meta.timestamp) || fileMtime();
    const sessionStart = parseTimestamp(meta.timestamp) || lastActive;

    return {
      sessionId: meta.id,
      projectPath: meta.cwd || "",
      summary: state.summary ?? "Codex session active",
      sessionStart,
      lastActive,
      lastPayloadType: state.lastPayloadType,
    };
  }

  determineStatus(session: CodexSession): AgentStatus {
    if (isIdle(session.lastActive)) {
      return AgentStatus.IDLE;
    }

    if (
      session.lastPayloadType === "agent_message" ||
      session.lastPayloadType === "task_complete" ||
      session.lastPayloadType === "turn_aborted"
    ) {
      return AgentStatus.WAITING;
    }

    return AgentStatus.RUNNING;
  }

  getConversation(sessionFilePath: string, options?: ConversationOptions): ConversationMessage[] {
    const verbose = options?.verbose ?? false;
    const source: JsonlTailSource<CodexConversationItem> = {
      parseLine: (line) => this.lineToConversationItem(line, verbose),
      finalize: (items) => this.dedupeMirroredMessages(items),
    };

    const tail = normalizeTail(options?.tail);
    if (tail !== undefined) {
      // Mirrored pairs sit next to each other, so a few extra messages of
      // look-behind keep de-duplication exact for the returned tail.
      return this.tailReader.read(sessionFilePath, tail, source, String(verbose), MIRROR_OVERSCAN);
    }

    const content = safeReadFile(sessionFilePath);
    if (content === undefined) return [];

    const items: CodexConversationItem[] = [];
    for (const line of content.trim().split("\n")) {
      const item = source.parseLine(line);
      if (item) items.push(item);
    }

    return this.dedupeMirroredMessages(items);
  }

  private lineToConversationItem(line: string, verbose: boolean): CodexConversationItem | null {
    let entry: CodexEventEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      return null;
    }

    const message = this.toConversationMessage(entry, verbose);
    if (!message) return null;

    return { entryType: entry.type, mirrorKey: this.mirroredMessageKey(entry, message), message };
  }

  /** Drop event_msg messages mirrored by a response_item with the same turn/role/content. */
  private dedupeMirroredMessages(items: CodexConversationItem[]): ConversationMessage[] {
    const responseItemMirrorKeys = new Set<string>();
    for (const item of items) {
      if (item.entryType === "response_item" && item.mirrorKey) {
        responseItemMirrorKeys.add(item.mirrorKey);
      }
    }

    const messages: ConversationMessage[] = [];
    for (const item of items) {
      if (
        item.entryType === "event_msg" &&
        item.mirrorKey &&
        responseItemMirrorKeys.has(item.mirrorKey)
      ) {
        continue;
      }
      messages.push(item.message);
    }
    return messages;
  }

  fileToSessionSummary(filePath: string): SessionSummary | null {
    const content = safeReadFile(filePath);
    if (content === undefined) return null;

    const allLines = content.trim().split("\n");
    if (!allLines[0]) return null;

    let metaEntry: CodexEventEntry;
    try {
      metaEntry = JSON.parse(allLines[0]);
    } catch {
      return null;
    }

    if (metaEntry.type !== "session_meta" || !metaEntry.payload?.id) {
      return null;
    }

    let firstUserMessage = "";
    let lastTimestamp: Date | null = null;

    for (let i = 1; i < allLines.length; i++) {
      let entry: CodexEventEntry;
      try {
        entry = JSON.parse(allLines[i]);
      } catch {
        continue;
      }

      const ts = parseTimestamp(entry.timestamp);
      if (ts) lastTimestamp = ts;

      if (!firstUserMessage) {
        const message = this.toConversationMessage(entry, false);
        const content = message?.content.trim() ?? "";
        if (
          message?.role === "user" &&
          content.length > 0 &&
          !this.isSyntheticUserMessage(content)
        ) {
          firstUserMessage = content;
        }
      }
    }

    const stat = safeStat(filePath);

    const startedAt =
      parseTimestamp(metaEntry.payload.timestamp) ||
      lastTimestamp ||
      stat?.birthtime ||
      stat?.mtime ||
      new Date();
    const lastActive = lastTimestamp || startedAt;

    return {
      type: "codex",
      sessionId: metaEntry.payload.id,
      cwd: metaEntry.payload.cwd || "",
      firstUserMessage,
      lastActive,
      startedAt,
      sessionFilePath: filePath,
    };
  }

  parseMetaTimestampMs(value?: string): number | null {
    if (typeof value !== "string") return null;

    const timestamp = parseTimestamp(value);
    if (!timestamp) return null;

    const timestampMs = timestamp.getTime();
    return Number.isFinite(timestampMs) ? timestampMs : null;
  }

  private normalizedPayloadType(entry: CodexEventEntry): string | undefined {
    const payloadType = entry.payload?.type;

    if (entry.type === "response_item" && payloadType === "message") {
      if (entry.payload?.role === "assistant") return "agent_message";
      if (entry.payload?.role === "user") return "user_message";
      return payloadType;
    }

    if (entry.type === "event_msg" && payloadType === "item_completed") {
      const itemType = entry.payload?.item?.type;
      if (itemType === "AgentMessage") return "agent_message";
      if (itemType === "UserMessage") return "user_message";
      return itemType ?? payloadType;
    }

    return payloadType;
  }

  private extractEntryText(entry: CodexEventEntry | undefined): string {
    if (!entry) return "";

    const legacyMessage = entry.payload?.message;
    if (typeof legacyMessage === "string" && legacyMessage.trim().length > 0) {
      return legacyMessage.trim();
    }

    const conversationMessage = this.toConversationMessage(entry, false);
    return conversationMessage?.content.trim() ?? "";
  }

  private toConversationMessage(
    entry: CodexEventEntry,
    verbose: boolean,
  ): ConversationMessage | null {
    if (entry.type === "session_meta") return null;

    const payloadType = entry.payload?.type;
    if (entry.type === "response_item" && payloadType === "message") {
      const role = this.mapCodexRole(entry.payload?.role, verbose);
      const text = this.extractContentText(entry.payload?.content);
      if (!role || !text) return null;

      return { role, content: text, timestamp: entry.timestamp };
    }

    if (entry.type === "event_msg" && payloadType === "item_completed") {
      const item = entry.payload?.item;
      const role = this.mapCodexItemRole(item?.type, verbose);
      const text = this.extractContentText(item?.content);
      if (!role || !text) return null;

      return { role, content: text, timestamp: entry.timestamp };
    }

    if (!payloadType) return null;

    let role: ConversationMessage["role"];
    if (payloadType === "user_message") {
      role = "user";
    } else if (payloadType === "agent_message" || payloadType === "task_complete") {
      role = "assistant";
    } else if (verbose) {
      role = "system";
    } else {
      return null;
    }

    const text = entry.payload?.message?.trim();
    if (!text) return null;

    return { role, content: text, timestamp: entry.timestamp };
  }

  private mapCodexRole(
    role: string | undefined,
    verbose: boolean,
  ): ConversationMessage["role"] | null {
    if (role === "user") return "user";
    if (role === "assistant") return "assistant";
    return verbose ? "system" : null;
  }

  private mapCodexItemRole(
    itemType: string | undefined,
    verbose: boolean,
  ): ConversationMessage["role"] | null {
    if (itemType === "AgentMessage") return "assistant";
    if (itemType === "UserMessage") return "user";
    return verbose ? "system" : null;
  }

  private mirroredMessageKey(entry: CodexEventEntry, message: ConversationMessage): string | null {
    const turnId =
      entry.payload?.turn_id || entry.payload?.internal_chat_message_metadata_passthrough?.turn_id;

    if (!turnId) return null;
    return `${turnId}\0${message.role}\0${message.content}`;
  }

  private extractContentText(content: string | CodexContent[] | undefined): string {
    if (typeof content === "string") return content.trim();
    if (!Array.isArray(content)) return "";

    return content
      .map((part) => part.text)
      .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
      .map((text) => text.trim())
      .join("\n")
      .trim();
  }

  private isSyntheticUserMessage(content: string): boolean {
    return (
      content.startsWith("<environment_context>") && content.includes("</environment_context>")
    );
  }
}
