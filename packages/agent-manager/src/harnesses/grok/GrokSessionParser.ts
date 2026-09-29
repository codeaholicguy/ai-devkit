import * as path from "path";
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
import { flattenTextBlocks, isIdle } from "../shared.js";

export const CHAT_HISTORY_FILE = "chat_history.jsonl";

/** One line of chat_history.jsonl. */
interface ChatRecord {
  type?: string;
  content?: unknown;
}

/**
 * O(1) running summary folded from chat records: only the first/last real
 * prompt and the role of the last user/assistant turn, never the turns.
 */
interface GrokSummaryState {
  /** A bounded cold start skipped the middle: later lines are not the session's first. */
  pastHead?: boolean;
  firstUserMessage?: string;
  lastUserMessage?: string;
  lastRole?: ConversationMessage["role"];
}

/** Parsed state for a single ~/.grok/sessions/<cwd>/<id>/ directory. */
export interface GrokSession {
  sessionId: string;
  projectPath: string;
  sessionFilePath: string;
  sessionStart: Date;
  lastActive: Date;
  firstUserMessage?: string;
  lastUserMessage?: string;
  lastRole?: ConversationMessage["role"];
}

export interface GrokSessionParserOptions {
  /** Cold-start scan bounds for `readSessionIncremental` (see IncrementalJsonlSummary). */
  summaryBounds?: JsonlSummaryBounds | false;
}

export class GrokSessionParser {
  /** Incremental reader backing `getConversation({ tail })`. */
  private readonly tailReader = new JsonlTailReader();

  private readonly sessionCache: IncrementalJsonlSummary<GrokSummaryState>;

  constructor(options: GrokSessionParserOptions = {}) {
    this.sessionCache = new IncrementalJsonlSummary(this.summaryReducer, {
      bounds: options.summaryBounds,
    });
  }

  /**
   * Parse a session directory into a {@link GrokSession} from its
   * chat_history.jsonl transcript. Returns null when the transcript is
   * missing — i.e. there is no real session to surface.
   */
  readSession(sessionDir: string, defaultCwd: string): GrokSession | null {
    const chatPath = path.join(sessionDir, CHAT_HISTORY_FILE);
    const chatStat = safeStat(chatPath);
    if (!chatStat) return null;

    const content = safeReadFile(chatPath);
    const state = content === undefined ? {} : reduceJsonlContent(this.summaryReducer, content);
    return this.toSession(sessionDir, defaultCwd, chatPath, chatStat.mtime, state);
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
  readSessionIncremental(sessionDir: string, defaultCwd: string): GrokSession | null {
    const chatPath = path.join(sessionDir, CHAT_HISTORY_FILE);
    const result = this.sessionCache.read(chatPath);
    if (result) {
      return this.toSession(sessionDir, defaultCwd, chatPath, result.mtime, result.state);
    }
    // Present but unreadable: surface the session without a summary, like readSession.
    const chatStat = safeStat(chatPath);
    return chatStat ? this.toSession(sessionDir, defaultCwd, chatPath, chatStat.mtime, {}) : null;
  }

  /** Evict cached summaries for files not read since the previous prune. */
  pruneSessionCache(): void {
    this.sessionCache.prune();
  }

  /** Accepts a session dir or an explicit chat_history.jsonl path. */
  getConversation(sessionPath: string, options?: ConversationOptions): ConversationMessage[] {
    const chatPath = this.resolveChatPath(sessionPath);
    const verbose = options?.verbose ?? false;
    const tail = normalizeTail(options?.tail);
    if (tail !== undefined) {
      return this.tailReader.read(
        chatPath,
        tail,
        { parseLine: (line) => this.lineToMessage(line, verbose) },
        String(verbose),
      );
    }
    return this.parseChatHistory(chatPath, verbose);
  }

  /**
   * Determine agent status from parsed session state.
   *
   * - past the idle threshold → IDLE
   * - last transcript turn is an assistant message → WAITING (awaiting user)
   * - otherwise (last turn was a user message, or unknown) → RUNNING
   */
  determineStatus(session: GrokSession): AgentStatus {
    if (isIdle(session.lastActive)) {
      return AgentStatus.IDLE;
    }
    if (session.lastRole === "assistant") {
      return AgentStatus.WAITING;
    }
    return AgentStatus.RUNNING;
  }

  /**
   * Fold one chat_history.jsonl entry into the O(1) summary. Uses the same
   * record rules as `getConversation` (see `toMessage`), minus system records.
   *
   * `skip` (bounded cold start) keeps the head's first user message and
   * clears the last user message and last role, so those come from the tail
   * only. A first user message beyond the head stays undefined rather than
   * being filled from the tail; latest fields before the tail window stay
   * undefined.
   */
  private readonly summaryReducer: JsonlSummaryReducer<GrokSummaryState> = {
    initial: () => ({}),
    reduce: (state, value) => {
      const message = this.toMessage(value, false);
      if (!message) return state;
      if (message.role === "user") {
        return {
          ...state,
          firstUserMessage:
            state.firstUserMessage ?? (state.pastHead ? undefined : message.content),
          lastUserMessage: message.content,
          lastRole: "user",
        };
      }
      return { ...state, lastRole: message.role };
    },
    skip: (state) => ({ pastHead: true, firstUserMessage: state.firstUserMessage }),
  };

  private toSession(
    sessionDir: string,
    defaultCwd: string,
    chatPath: string,
    lastActive: Date,
    state: GrokSummaryState,
  ): GrokSession {
    const dirStat = safeStat(sessionDir);
    return {
      sessionId: path.basename(sessionDir),
      projectPath: defaultCwd,
      sessionFilePath: chatPath,
      sessionStart: dirStat?.birthtime || lastActive,
      lastActive,
      firstUserMessage: state.firstUserMessage,
      lastUserMessage: state.lastUserMessage,
      lastRole: state.lastRole,
    };
  }

  /** Full pass over chat_history.jsonl building every conversation turn. */
  private parseChatHistory(chatPath: string, verbose: boolean): ConversationMessage[] {
    const content = safeReadFile(chatPath);
    if (content === undefined) return [];

    const messages: ConversationMessage[] = [];
    for (const line of content.trim().split("\n")) {
      const message = this.lineToMessage(line, verbose);
      if (message) messages.push(message);
    }
    return messages;
  }

  /**
   * Map one parsed chat record to a conversation turn, or null to skip it.
   * Each record is a { type: 'system' | 'user' | 'assistant', content } object
   * where content is either a string or an array of { type: 'text', text } blocks.
   *
   * Grok wraps the real user prompt in <user_query>...</user_query>; the other
   * user records are context injections (<user_info>, <system-reminder>, ...)
   * and are skipped so the summary is the actual prompt, not boilerplate.
   */
  private toMessage(value: unknown, verbose: boolean): ConversationMessage | null {
    if (!value || typeof value !== "object") return null;
    const record = value as ChatRecord;

    const text = flattenTextBlocks(record.content);
    if (record.type === "user") {
      const query = this.extractUserQuery(text);
      return query === null ? null : { role: "user", content: query };
    }
    if (record.type === "assistant") {
      return text ? { role: "assistant", content: text } : null;
    }
    if (verbose && record.type === "system") {
      return text ? { role: "system", content: text } : null;
    }
    return null;
  }

  /** Convert one chat_history.jsonl line into a message, or null when it is not one. */
  private lineToMessage(line: string, verbose: boolean): ConversationMessage | null {
    if (!line.trim()) return null;

    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      return null;
    }
    return this.toMessage(record, verbose);
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
    return sessionPath.endsWith(".jsonl") ? sessionPath : path.join(sessionPath, CHAT_HISTORY_FILE);
  }
}
