import * as fs from "fs";
import * as path from "path";
import type {
  ConversationMessage,
  ConversationOptions,
  SessionSummary,
} from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import {
  IncrementalJsonlSummary,
  reduceJsonlContent,
  type JsonlSummaryBounds,
  type JsonlSummaryReducer,
} from "../../utils/IncrementalJsonlSummary.js";
import { JsonlTailReader, normalizeTail } from "../../utils/jsonlTail.js";
import { safeReadFile, safeStat } from "../../utils/session.js";
import { isIdle, parseTimestamp, SUMMARY_MAX_LENGTH, truncate } from "../shared.js";

export interface PiSession {
  sessionId: string;
  projectPath: string;
  summary: string;
  sessionStart: Date;
  lastActive: Date;
  lastRole?: ConversationMessage["role"];
}

interface PiLine {
  timestamp?: string;
  role?: string;
  type?: string;
  content?: unknown;
  text?: unknown;
  message?: unknown;
  sessionId?: string;
  session_id?: string;
  id?: string;
  cwd?: string;
  projectPath?: string;
  project_path?: string;
  payload?: Record<string, unknown>;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

type PiRecord = Record<string, unknown>;

/**
 * Session identity read from the start of a file, without parsing the rest.
 * Fields are undefined when not found in the head.
 */
export interface PiSessionHead {
  sessionId?: string;
  projectPath?: string;
  /** Bytes read from the file. */
  bytesRead: number;
  /** True when the whole file fit in the head read. */
  complete: boolean;
}

/**
 * O(1) running summary folded from session entries; `toSession` turns it into
 * a `PiSession`. Timestamps are epoch ms so cached state stays immutable.
 */
interface PiSummaryState {
  entryCount: number;
  /** A bounded cold start skipped the middle: later lines are not the session's first. */
  pastHead?: boolean;
  sessionId?: string;
  projectPath?: string;
  firstTimestampMs?: number;
  lastTimestampMs?: number;
  firstUserMessage?: string;
  lastUserMessage?: string;
  lastRole?: ConversationMessage["role"];
}

/** Upper bound for `readSessionHead`; Pi writes its session header as the first line. */
export const PI_SESSION_HEAD_MAX_BYTES = 64 * 1024;
const HEAD_CHUNK_BYTES = 4 * 1024;

export interface PiSessionParserOptions {
  /** Cold-start scan bounds for `readSessionIncremental` (see IncrementalJsonlSummary). */
  summaryBounds?: JsonlSummaryBounds | false;
}

export class PiSessionParser {
  /** Incremental reader backing `getConversation({ tail })`. */
  private readonly tailReader = new JsonlTailReader();

  private readonly sessionCache: IncrementalJsonlSummary<PiSummaryState>;

  constructor(options: PiSessionParserOptions = {}) {
    this.sessionCache = new IncrementalJsonlSummary(this.summaryReducer, {
      bounds: options.summaryBounds,
    });
  }

  readSession(filePath: string, fallbackCwd = ""): PiSession | null {
    const content = safeReadFile(filePath);
    if (content === undefined) return null;
    return this.toSession(filePath, fallbackCwd, reduceJsonlContent(this.summaryReducer, content));
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
  readSessionIncremental(filePath: string, fallbackCwd = ""): PiSession | null {
    const result = this.sessionCache.read(filePath);
    return result ? this.toSession(filePath, fallbackCwd, result.state) : null;
  }

  /** Evict cached summaries for files not read since the previous prune. */
  pruneSessionCache(): void {
    this.sessionCache.prune();
  }

  /**
   * Read the session id and project path from the first complete lines of a
   * file, stopping once both are found or after `maxBytes`. Null if unreadable.
   */
  readSessionHead(filePath: string, maxBytes = PI_SESSION_HEAD_MAX_BYTES): PiSessionHead | null {
    let fd: number;
    try {
      fd = fs.openSync(filePath, "r");
    } catch {
      return null;
    }

    try {
      const head: PiSessionHead = { bytesRead: 0, complete: false };
      const buffer = Buffer.alloc(maxBytes);
      let lineStart = 0;

      while (head.bytesRead < maxBytes) {
        const bytesRead = fs.readSync(
          fd,
          buffer,
          head.bytesRead,
          Math.min(HEAD_CHUNK_BYTES, maxBytes - head.bytesRead),
          head.bytesRead,
        );
        if (bytesRead === 0) {
          head.complete = true;
          break;
        }
        head.bytesRead += bytesRead;

        let newline = buffer.indexOf(0x0a, lineStart);
        while (newline !== -1 && newline < head.bytesRead) {
          this.applyHeadLine(head, buffer.toString("utf8", lineStart, newline));
          lineStart = newline + 1;
          if (head.sessionId && head.projectPath) return head;
          newline = buffer.indexOf(0x0a, lineStart);
        }
      }

      // The unterminated last line is only trusted when it ends the file
      if (head.complete && lineStart < head.bytesRead) {
        this.applyHeadLine(head, buffer.toString("utf8", lineStart, head.bytesRead));
      }
      return head;
    } catch {
      return null;
    } finally {
      fs.closeSync(fd);
    }
  }

  determineStatus(session: PiSession): AgentStatus {
    if (isIdle(session.lastActive)) return AgentStatus.IDLE;
    if (session.lastRole === "assistant") return AgentStatus.WAITING;
    return AgentStatus.RUNNING;
  }

  getConversation(sessionFilePath: string, options?: ConversationOptions): ConversationMessage[] {
    const includeSystem = options?.verbose ?? false;
    const tail = normalizeTail(options?.tail);
    if (tail !== undefined) {
      return this.tailReader.read(
        sessionFilePath,
        tail,
        {
          parseLine: (line) => {
            const entry = this.parseJsonlLine(line);
            return entry ? this.entryToMessage(entry, includeSystem) : null;
          },
        },
        String(includeSystem),
      );
    }
    return this.entriesToMessages(this.readJsonl(sessionFilePath), includeSystem);
  }

  fileToSessionSummary(filePath: string): SessionSummary | null {
    const content = safeReadFile(filePath);
    if (content === undefined) return null;

    const state = reduceJsonlContent(this.summaryReducer, content);
    const session = this.toSession(filePath, "", state);
    if (!session) return null;
    return {
      type: "pi",
      sessionId: session.sessionId,
      cwd: session.projectPath,
      firstUserMessage: state.firstUserMessage ?? "",
      lastActive: session.lastActive,
      startedAt: session.sessionStart,
      sessionFilePath: filePath,
    };
  }

  sessionIdFromFile(filePath: string): string {
    const base = path.basename(filePath, ".jsonl");
    const underscore = base.lastIndexOf("_");
    return underscore >= 0 ? base.slice(underscore + 1) : base;
  }

  /**
   * Fold one JSONL entry into the O(1) session summary. Mirrors the previous
   * whole-file scan: id, cwd and start come from the first entry that has
   * them; last active, last user message and last role track the latest one.
   *
   * `skip` (bounded cold start) keeps the head's first-* fields (id, cwd,
   * start, first user message) and clears the latest ones, so those come from
   * the tail only. Tail entries never fill a first-* field: Pi message entries
   * carry their own `id`, which must not become the session id. A first-*
   * value beyond the head falls back like a missing one (filename id,
   * `fallbackCwd`, file birthtime, no first user message); a latest value
   * before the tail window stays unset (file mtime for last active).
   */
  private readonly summaryReducer: JsonlSummaryReducer<PiSummaryState> = {
    initial: () => ({ entryCount: 0 }),
    reduce: (state, value) => {
      const entry = this.asRecord(value) as PiLine | null;
      if (!entry) return state;

      const next: PiSummaryState = { ...state, entryCount: state.entryCount + 1 };
      const inHead = !state.pastHead;
      if (inHead) {
        next.sessionId ??= this.entrySessionId(entry);
        next.projectPath ??= this.entryCwd(entry);
      }

      const timestamp = parseTimestamp(this.entryTimestamp(entry));
      if (timestamp) {
        if (inHead) next.firstTimestampMs ??= timestamp.getTime();
        next.lastTimestampMs = timestamp.getTime();
      }

      const message = this.entryToMessage(entry, true);
      if (message) {
        next.lastRole = message.role;
        if (message.role === "user") {
          next.lastUserMessage = message.content;
          if (inHead) next.firstUserMessage ??= message.content;
        }
      }
      return next;
    },
    skip: (state) => ({
      entryCount: state.entryCount,
      pastHead: true,
      sessionId: state.sessionId,
      projectPath: state.projectPath,
      firstTimestampMs: state.firstTimestampMs,
      firstUserMessage: state.firstUserMessage,
    }),
  };

  private toSession(
    filePath: string,
    fallbackCwd: string,
    state: PiSummaryState,
  ): PiSession | null {
    if (state.entryCount === 0) return null;

    const needsStat = state.firstTimestampMs === undefined || state.lastTimestampMs === undefined;
    const stat = needsStat ? safeStat(filePath) : undefined;
    const sessionStart =
      state.firstTimestampMs !== undefined
        ? new Date(state.firstTimestampMs)
        : (stat?.birthtime ?? stat?.mtime ?? new Date());
    const lastActive =
      state.lastTimestampMs !== undefined
        ? new Date(state.lastTimestampMs)
        : (stat?.mtime ?? sessionStart);

    return {
      sessionId: state.sessionId || this.sessionIdFromFile(filePath),
      projectPath: state.projectPath || fallbackCwd,
      summary: state.lastUserMessage
        ? truncate(state.lastUserMessage, SUMMARY_MAX_LENGTH)
        : "Pi session active",
      sessionStart,
      lastActive,
      lastRole: state.lastRole,
    };
  }

  private applyHeadLine(head: PiSessionHead, line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let entry: PiLine | null;
    try {
      entry = this.asRecord(JSON.parse(trimmed)) as PiLine | null;
    } catch {
      return;
    }
    if (!entry) return;
    head.sessionId ??= this.entrySessionId(entry);
    head.projectPath ??= this.entryCwd(entry);
  }

  private readJsonl(filePath: string): PiLine[] {
    const content = safeReadFile(filePath);
    if (content === undefined) return [];

    const entries: PiLine[] = [];
    for (const line of content.split(/\r?\n/)) {
      const entry = this.parseJsonlLine(line);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  private parseJsonlLine(line: string): PiLine | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as PiLine;
      }
    } catch {
      return null;
    }
    return null;
  }

  private entriesToMessages(entries: PiLine[], includeSystem: boolean): ConversationMessage[] {
    return entries
      .map((entry) => this.entryToMessage(entry, includeSystem))
      .filter((msg): msg is ConversationMessage => msg !== null);
  }

  private entryToMessage(entry: PiLine, includeSystem: boolean): ConversationMessage | null {
    const role = this.entryRole(entry);
    if (!role) return null;
    if (role === "system" && !includeSystem) return null;

    const content = this.entryContent(entry).trim();
    if (!content) return null;

    return {
      role,
      content,
      timestamp: this.entryTimestamp(entry),
    };
  }

  private entryRole(entry: PiLine): ConversationMessage["role"] | null {
    const message = this.messageRecord(entry);
    const raw = this.firstString(
      entry.role,
      message?.role,
      this.roleLikeType(entry.type),
      entry.payload?.role,
      entry.payload?.type,
      entry.data?.role,
      entry.data?.type,
    );
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    if (normalized === "user" || normalized === "human") return "user";
    if (normalized === "assistant" || normalized === "ai" || normalized === "pi")
      return "assistant";
    if (normalized === "system") return "system";
    return null;
  }

  private entryContent(entry: PiLine): string {
    const message = this.messageRecord(entry);
    const candidates = [
      entry.content,
      entry.text,
      message?.content,
      message?.text,
      message?.message,
      entry.message,
      entry.payload?.content,
      entry.payload?.text,
      entry.payload?.message,
      entry.data?.content,
      entry.data?.text,
      entry.data?.message,
    ];

    for (const candidate of candidates) {
      const text = this.contentToString(candidate);
      if (text) return text;
    }
    return "";
  }

  private contentToString(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      return value
        .map((item) => this.contentToString(item))
        .filter(Boolean)
        .join("");
    }
    if (!value || typeof value !== "object") return "";

    const record = value as Record<string, unknown>;
    return this.contentToString(record.content ?? record.text ?? record.value);
  }

  private messageRecord(entry: PiLine): PiRecord | null {
    return this.asRecord(entry.message);
  }

  private asRecord(value: unknown): PiRecord | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as PiRecord;
  }

  private roleLikeType(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const normalized = value.toLowerCase();
    if (["user", "human", "assistant", "ai", "pi", "system"].includes(normalized)) {
      return value;
    }
    return undefined;
  }

  private entryTimestamp(entry: PiLine): string | undefined {
    return this.firstString(
      entry.timestamp,
      entry.payload?.timestamp,
      entry.data?.timestamp,
      entry.createdAt,
      entry.created_at,
    );
  }

  private entrySessionId(entry: PiLine): string | undefined {
    return this.firstString(
      entry.sessionId,
      entry.session_id,
      entry.id,
      entry.payload?.sessionId,
      entry.payload?.session_id,
      entry.payload?.id,
      entry.data?.sessionId,
      entry.data?.session_id,
      entry.data?.id,
    );
  }

  private entryCwd(entry: PiLine): string | undefined {
    return this.firstString(
      entry.cwd,
      entry.projectPath,
      entry.project_path,
      entry.payload?.cwd,
      entry.payload?.projectPath,
      entry.payload?.project_path,
      entry.data?.cwd,
      entry.data?.projectPath,
      entry.data?.project_path,
    );
  }

  private firstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === "string" && value) return value;
    }
    return undefined;
  }
}
