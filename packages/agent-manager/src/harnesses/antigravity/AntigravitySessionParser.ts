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
import { flattenTextBlocks, isIdle, parseTimestamp } from "../shared.js";

/** One line of transcript.jsonl. */
interface TranscriptRecord {
  source?: string;
  type?: string;
  created_at?: string;
  content?: unknown;
}

/** O(1) running summary folded from transcript records, never the turns themselves. */
interface AntigravitySummaryState {
  /** A bounded cold start skipped the middle: later lines are not the session's first. */
  pastHead?: boolean;
  firstUserMessage?: string;
  lastUserMessage?: string;
  lastRole?: ConversationMessage["role"];
  /** Latest `created_at` seen, in epoch ms. */
  lastActiveMs?: number;
}

/** Parsed state for a single conversation. */
export interface AntigravitySession {
  sessionId: string;
  projectPath: string;
  sessionFilePath: string;
  sessionStart: Date;
  lastActive: Date;
  firstUserMessage?: string;
  lastUserMessage?: string;
  lastRole?: ConversationMessage["role"];
}

export interface AntigravitySessionParserOptions {
  /** Cold-start scan bounds for `readSessionIncremental` (see IncrementalJsonlSummary). */
  summaryBounds?: JsonlSummaryBounds | false;
}

export class AntigravitySessionParser {
  /** Incremental reader backing `getConversation({ tail })`. */
  private readonly tailReader = new JsonlTailReader();

  private readonly sessionCache: IncrementalJsonlSummary<AntigravitySummaryState>;

  constructor(options: AntigravitySessionParserOptions = {}) {
    this.sessionCache = new IncrementalJsonlSummary(this.summaryReducer, {
      bounds: options.summaryBounds,
    });
  }

  /**
   * Parse a conversation's transcript.jsonl into an {@link AntigravitySession}.
   * Returns null when the transcript is missing — there is no real session to
   * surface.
   */
  readSession(
    conversationId: string,
    transcriptPath: string,
    projectPath: string,
  ): AntigravitySession | null {
    const stat = safeStat(transcriptPath);
    if (!stat) return null;

    const content = safeReadFile(transcriptPath);
    const state = content === undefined ? {} : reduceJsonlContent(this.summaryReducer, content);
    return this.toSession(conversationId, transcriptPath, projectPath, stat, stat.mtime, state);
  }

  /**
   * Same result as `readSession`, but backed by a per-instance incremental
   * cache so repeated refreshes only parse bytes appended since the last call.
   * Call `pruneSessionCache()` once per refresh to evict files no longer read.
   *
   * The first read of a large transcript is a bounded head + tail scan (see
   * `summaryReducer.skip`).
   */
  readSessionIncremental(
    conversationId: string,
    transcriptPath: string,
    projectPath: string,
  ): AntigravitySession | null {
    const stat = safeStat(transcriptPath);
    if (!stat) return null;

    // Present but unreadable: surface the session without a summary, like readSession.
    const result = this.sessionCache.read(transcriptPath);
    return this.toSession(
      conversationId,
      transcriptPath,
      projectPath,
      stat,
      result?.mtime ?? stat.mtime,
      result?.state ?? {},
    );
  }

  /** Evict cached summaries for files not read since the previous prune. */
  pruneSessionCache(): void {
    this.sessionCache.prune();
  }

  getConversation(transcriptPath: string, options?: ConversationOptions): ConversationMessage[] {
    const verbose = options?.verbose ?? false;
    const tail = normalizeTail(options?.tail);
    if (tail === undefined) {
      return this.parseTranscript(transcriptPath, verbose);
    }

    return this.tailReader.read(
      transcriptPath,
      tail,
      {
        parseLine: (line) => {
          const record = this.parseRecord(line);
          return record ? this.recordToMessage(record, verbose) : null;
        },
      },
      String(verbose),
    );
  }

  /**
   * - past the idle threshold → IDLE
   * - last turn is an assistant reply → WAITING (awaiting user)
   * - otherwise (last turn was a user message, or unknown) → RUNNING
   */
  determineStatus(session: AntigravitySession): AgentStatus {
    if (isIdle(session.lastActive)) {
      return AgentStatus.IDLE;
    }
    if (session.lastRole === "assistant") {
      return AgentStatus.WAITING;
    }
    return AgentStatus.RUNNING;
  }

  /**
   * Fold one transcript record into the O(1) summary: first/last user request,
   * the role of the last user/assistant turn, and the latest `created_at`.
   * Uses the same record rules as `getConversation` (see `recordToMessage`).
   *
   * `skip` (bounded cold start) keeps the head's first user request and resets
   * the latest fields, so those come from the tail only; without a timestamp in
   * the tail, `lastActive` falls back to the file mtime.
   */
  private readonly summaryReducer: JsonlSummaryReducer<AntigravitySummaryState> = {
    initial: () => ({}),
    reduce: (state, value) => {
      if (value === null || value === undefined) return state;
      const record = value as TranscriptRecord;

      let next = state;
      const atMs = parseTimestamp(record.created_at)?.getTime();
      if (atMs !== undefined && (next.lastActiveMs === undefined || atMs > next.lastActiveMs)) {
        next = { ...next, lastActiveMs: atMs };
      }

      const message = this.recordToMessage(record, false);
      if (message?.role === "user") {
        return {
          ...next,
          firstUserMessage: next.firstUserMessage ?? (next.pastHead ? undefined : message.content),
          lastUserMessage: message.content,
          lastRole: "user",
        };
      }
      if (message?.role === "assistant") return { ...next, lastRole: "assistant" };
      return next;
    },
    skip: (state) => ({ pastHead: true, firstUserMessage: state.firstUserMessage }),
  };

  private toSession(
    conversationId: string,
    transcriptPath: string,
    projectPath: string,
    stat: { birthtime: Date },
    mtime: Date,
    state: AntigravitySummaryState,
  ): AntigravitySession {
    return {
      sessionId: conversationId,
      projectPath,
      sessionFilePath: transcriptPath,
      sessionStart: stat.birthtime,
      lastActive: state.lastActiveMs === undefined ? mtime : new Date(state.lastActiveMs),
      firstUserMessage: state.firstUserMessage,
      lastUserMessage: state.lastUserMessage,
      lastRole: state.lastRole,
    };
  }

  /** Full pass over transcript.jsonl building every conversation turn. */
  private parseTranscript(transcriptPath: string, verbose: boolean): ConversationMessage[] {
    const content = safeReadFile(transcriptPath);
    if (content === undefined) return [];

    const messages: ConversationMessage[] = [];
    for (const line of content.trim().split("\n")) {
      const record = this.parseRecord(line);
      const message = record ? this.recordToMessage(record, verbose) : null;
      if (message) messages.push(message);
    }
    return messages;
  }

  private parseRecord(line: string): TranscriptRecord | null {
    if (!line.trim()) return null;
    try {
      return JSON.parse(line) as TranscriptRecord;
    } catch {
      return null;
    }
  }

  /**
   * USER_INPUT records are user turns and PLANNER_RESPONSE records are the
   * model's reply. Everything else — MODEL tool calls (RUN_COMMAND, ...) and
   * SYSTEM records (history, checkpoints) — is execution detail, shown as a
   * system message only in verbose mode.
   */
  private recordToMessage(record: TranscriptRecord, verbose: boolean): ConversationMessage | null {
    const text = flattenTextBlocks(record.content);
    if (record.type === "USER_INPUT") {
      const request = this.extractUserRequest(text);
      return request === null ? null : { role: "user", content: request };
    }
    if (!text) return null;
    if (record.type === "PLANNER_RESPONSE") return { role: "assistant", content: text };
    return verbose ? { role: "system", content: text } : null;
  }

  /**
   * The prompt inside <USER_REQUEST>...</USER_REQUEST>, or the whole trimmed
   * text when the record has no wrapper. Null for an unwrapped blank record.
   */
  private extractUserRequest(text: string): string | null {
    const match = text.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
    if (match) return match[1].trim();
    return text.trim() || null;
  }
}
