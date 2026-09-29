import type { ConversationMessage, ConversationOptions } from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import {
  IncrementalJsonlSummary,
  reduceJsonlContent,
  type JsonlSummaryBounds,
  type JsonlSummaryReducer,
} from "../../utils/IncrementalJsonlSummary.js";
import { JsonlTailReader, normalizeTail } from "../../utils/jsonlTail.js";
import { safeReadFile, safeStat } from "../../utils/session.js";
import { isIdle, parseTimestamp } from "../shared.js";

type KiroRecord = Record<string, unknown>;

/** One line of <session-id>.jsonl. */
interface KiroLine {
  kind?: string;
  timestamp?: string;
  data?: KiroRecord;
}

/** The sibling <session-id>.json metadata file. */
interface KiroMetadata {
  sessionId: string;
  cwd: string;
  title: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** O(1) running summary folded from transcript lines, never the entries themselves. */
interface KiroSummaryState {
  /** A bounded cold start skipped the middle: later lines are not the session's first. */
  pastHead?: boolean;
  firstUserMessage?: string;
  lastUserMessage?: string;
  /** First and last entry timestamps in file order, in epoch ms. */
  firstTimestampMs?: number;
  lastTimestampMs?: number;
  lastEventKind?: string;
  lastAssistantHasToolUse?: boolean;
}

export interface KiroSessionParserOptions {
  /** Cold-start scan bounds for `readSessionIncremental` (see IncrementalJsonlSummary). */
  summaryBounds?: JsonlSummaryBounds | false;
}

export interface KiroSessionPaths {
  sessionId: string;
  transcriptPath: string;
  metadataPath: string;
}

export interface KiroSession {
  sessionId: string;
  projectPath: string;
  sessionFilePath: string;
  title: string;
  firstUserMessage: string;
  lastUserMessage?: string;
  sessionStart: Date;
  lastActive: Date;
  lastEventKind?: string;
  lastAssistantHasToolUse: boolean;
}

export class KiroSessionParser {
  /** Incremental reader backing `getConversation({ tail })`. */
  private readonly tailReader = new JsonlTailReader();

  private readonly sessionCache: IncrementalJsonlSummary<KiroSummaryState>;

  constructor(options: KiroSessionParserOptions = {}) {
    this.sessionCache = new IncrementalJsonlSummary(this.summaryReducer, {
      bounds: options.summaryBounds,
    });
  }

  /**
   * Parse a session from its transcript and metadata. Metadata wins for the
   * session id, cwd and timestamps; `fallbackCwd` is used when it has no cwd.
   * Returns null when the transcript is missing.
   */
  readSession(paths: KiroSessionPaths, fallbackCwd = ""): KiroSession | null {
    const stat = safeStat(paths.transcriptPath);
    if (!stat?.isFile()) return null;

    const content = safeReadFile(paths.transcriptPath);
    const state = content === undefined ? {} : reduceJsonlContent(this.summaryReducer, content);
    return this.toSession(paths, fallbackCwd, stat, state);
  }

  /**
   * Same result as `readSession`, but the transcript summary is backed by a
   * per-instance incremental cache, so repeated refreshes only parse bytes
   * appended since the last call. The small metadata file is still read each
   * time. Call `pruneSessionCache()` once per refresh.
   */
  readSessionIncremental(paths: KiroSessionPaths, fallbackCwd = ""): KiroSession | null {
    const stat = safeStat(paths.transcriptPath);
    if (!stat?.isFile()) return null;

    // Present but unreadable: surface the session without a summary, like readSession.
    const state = this.sessionCache.read(paths.transcriptPath)?.state ?? {};
    return this.toSession(paths, fallbackCwd, stat, state);
  }

  /** Evict cached summaries for files not read since the previous prune. */
  pruneSessionCache(): void {
    this.sessionCache.prune();
  }

  getConversation(transcriptPath: string, options?: ConversationOptions): ConversationMessage[] {
    const verbose = options?.verbose ?? false;
    const tail = normalizeTail(options?.tail);
    if (tail === undefined) {
      return this.entriesToMessages(this.readJsonl(transcriptPath), verbose);
    }

    return this.tailReader.read(
      transcriptPath,
      tail,
      {
        parseLine: (line) => {
          const entry = this.parseJsonlLine(line);
          return entry ? this.entryToMessage(entry, verbose) : null;
        },
      },
      String(verbose),
    );
  }

  /**
   * - past the idle threshold → IDLE
   * - last event is an assistant reply without a tool call → WAITING
   * - otherwise (user prompt, tool call or tool result) → RUNNING
   */
  determineStatus(session: KiroSession): AgentStatus {
    if (isIdle(session.lastActive)) return AgentStatus.IDLE;
    if (session.lastEventKind === "AssistantMessage" && !session.lastAssistantHasToolUse) {
      return AgentStatus.WAITING;
    }
    return AgentStatus.RUNNING;
  }

  /**
   * Fold one transcript line into the O(1) summary. Uses the same entry rules
   * as `getConversation` (see `entryToMessage`); non-object lines are ignored.
   *
   * `skip` (bounded cold start) keeps the head's first prompt and timestamp and
   * resets the latest fields, so those come from the tail only.
   */
  private readonly summaryReducer: JsonlSummaryReducer<KiroSummaryState> = {
    initial: () => ({}),
    reduce: (state, value) => {
      const entry = asRecord(value) as KiroLine | null;
      if (!entry) return state;

      const next: KiroSummaryState = {
        ...state,
        lastEventKind: entry.kind,
        lastAssistantHasToolUse:
          entry.kind === "AssistantMessage" && this.hasContentKind(entry, "toolUse"),
      };

      const timestampMs = parseTimestamp(this.entryTimestamp(entry))?.getTime();
      if (timestampMs !== undefined) {
        next.lastTimestampMs = timestampMs;
        if (next.firstTimestampMs === undefined && !next.pastHead) {
          next.firstTimestampMs = timestampMs;
        }
      }

      const message = this.entryToMessage(entry, false);
      if (message?.role === "user") {
        next.lastUserMessage = message.content;
        if (next.firstUserMessage === undefined && !next.pastHead) {
          next.firstUserMessage = message.content;
        }
      }
      return next;
    },
    skip: (state) => ({
      pastHead: true,
      firstUserMessage: state.firstUserMessage,
      firstTimestampMs: state.firstTimestampMs,
    }),
  };

  private toSession(
    paths: KiroSessionPaths,
    fallbackCwd: string,
    stat: { birthtime: Date; mtime: Date },
    state: KiroSummaryState,
  ): KiroSession {
    const metadata = this.readMetadata(paths);
    const firstTimestamp =
      state.firstTimestampMs === undefined ? undefined : new Date(state.firstTimestampMs);
    const lastTimestamp =
      state.lastTimestampMs === undefined ? undefined : new Date(state.lastTimestampMs);

    return {
      sessionId: metadata.sessionId,
      projectPath: metadata.cwd || fallbackCwd,
      sessionFilePath: paths.transcriptPath,
      title: metadata.title,
      firstUserMessage: state.firstUserMessage ?? "",
      lastUserMessage: state.lastUserMessage,
      sessionStart: metadata.createdAt ?? firstTimestamp ?? stat.birthtime,
      lastActive: metadata.updatedAt ?? lastTimestamp ?? stat.mtime,
      lastEventKind: state.lastEventKind,
      lastAssistantHasToolUse: state.lastAssistantHasToolUse ?? false,
    };
  }

  private readMetadata({ sessionId, metadataPath }: KiroSessionPaths): KiroMetadata {
    const empty: KiroMetadata = {
      sessionId,
      cwd: "",
      title: "",
      createdAt: null,
      updatedAt: null,
    };
    const content = safeReadFile(metadataPath);
    if (content === undefined) return empty;

    let parsed: KiroRecord | null;
    try {
      parsed = asRecord(JSON.parse(content));
    } catch {
      return empty;
    }
    if (!parsed) return empty;

    return {
      sessionId: firstString(parsed.session_id, parsed.sessionId) ?? sessionId,
      cwd: firstString(parsed.cwd) ?? "",
      title: firstString(parsed.title) ?? "",
      createdAt: parseTimestamp(parsed.created_at ?? parsed.createdAt),
      updatedAt: parseTimestamp(parsed.updated_at ?? parsed.updatedAt),
    };
  }

  private readJsonl(filePath: string): KiroLine[] {
    const content = safeReadFile(filePath);
    if (content === undefined) return [];

    const entries: KiroLine[] = [];
    for (const line of content.split(/\r?\n/)) {
      const entry = this.parseJsonlLine(line);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  private parseJsonlLine(line: string): KiroLine | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      return asRecord(JSON.parse(trimmed)) as KiroLine | null;
    } catch {
      return null;
    }
  }

  private entriesToMessages(entries: KiroLine[], verbose: boolean): ConversationMessage[] {
    const messages: ConversationMessage[] = [];
    for (const entry of entries) {
      const message = this.entryToMessage(entry, verbose);
      if (message) messages.push(message);
    }
    return messages;
  }

  /**
   * Prompt → user, AssistantMessage → assistant (tool calls appended in
   * verbose mode), ToolResults → system (verbose only).
   */
  private entryToMessage(entry: KiroLine, verbose: boolean): ConversationMessage | null {
    let role: ConversationMessage["role"];
    let content: string;

    if (entry.kind === "Prompt") {
      role = "user";
      content = this.textContent(entry);
    } else if (entry.kind === "AssistantMessage") {
      role = "assistant";
      const parts = [this.textContent(entry)];
      if (verbose) parts.push(...this.toolUseContent(entry));
      content = parts.filter(Boolean).join("\n");
    } else if (entry.kind === "ToolResults" && verbose) {
      role = "system";
      content = this.toolResultContent(entry).join("\n");
    } else {
      return null;
    }

    if (!content) return null;
    return {
      role,
      content,
      timestamp: this.entryTimestamp(entry),
    };
  }

  private textContent(entry: KiroLine): string {
    return this.contentBlocks(entry)
      .filter((block) => block.kind === "text")
      .map((block) => (typeof block.data === "string" ? block.data : ""))
      .filter(Boolean)
      .join("");
  }

  private toolUseContent(entry: KiroLine): string[] {
    return this.contentBlocks(entry)
      .filter((block) => block.kind === "toolUse")
      .map((block) => {
        const data = asRecord(block.data);
        const name = firstString(data?.name) ?? "unknown";
        const input = formatValue(data?.input);
        return `[Tool: ${name}]${input ? ` ${input}` : ""}`;
      });
  }

  private toolResultContent(entry: KiroLine): string[] {
    return this.contentBlocks(entry)
      .filter((block) => block.kind === "toolResult")
      .map((block) => {
        const data = asRecord(block.data);
        const prefix = data?.status === "error" ? "[Tool Error]" : "[Tool Result]";
        const result = formatValue(data?.result ?? data?.results ?? data?.content);
        return `${prefix}${result ? ` ${result}` : ""}`;
      });
  }

  private contentBlocks(entry: KiroLine): Array<{ kind?: string; data?: unknown }> {
    const content = entry.data?.content;
    if (!Array.isArray(content)) return [];
    return content
      .map((block) => asRecord(block))
      .filter((block): block is KiroRecord => block !== null);
  }

  private hasContentKind(entry: KiroLine, kind: string): boolean {
    return this.contentBlocks(entry).some((block) => block.kind === kind);
  }

  /** The line's own timestamp, else `data.meta.timestamp` (epoch seconds/ms or ISO). */
  private entryTimestamp(entry: KiroLine): string | undefined {
    const direct = firstString(entry.timestamp);
    if (direct) return direct;

    const meta = asRecord(entry.data?.meta);
    return parseTimestamp(meta?.timestamp)?.toISOString();
  }
}

export function asRecord(value: unknown): KiroRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as KiroRecord;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
