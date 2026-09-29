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
import { isIdle, parseTimestamp, SUMMARY_MAX_LENGTH, truncate } from "../shared.js";

interface CopilotEventEntry {
  type?: string;
  data?: {
    sessionId?: string;
    startTime?: string;
    context?: {
      cwd?: string;
      gitRoot?: string;
      branch?: string;
    };
    content?: string;
    transformedContent?: string;
    message?: string;
    text?: string;
    result?: {
      content?: string;
      detailedContent?: string;
    };
    output?: string;
  };
  timestamp?: string;
}

interface CopilotWorkspace {
  id?: string;
  cwd?: string;
  name?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CopilotSession {
  sessionId: string;
  projectPath: string;
  summary: string;
  sessionStart: Date;
  lastActive: Date;
  lastEventType?: string;
  firstUserMessage: string;
  eventsFilePath: string;
}

/**
 * O(1) running summary of events.jsonl. Timestamps are epoch ms so cached
 * state stays immutable; unset fields fall back to workspace.yaml metadata.
 */
interface CopilotEventState {
  /** Number of lines that parsed as JSON. */
  entryCount: number;
  /** A bounded cold start skipped the middle: later lines are not the session's first. */
  pastHead?: boolean;
  sessionId?: string;
  projectPath?: string;
  sessionStartMs?: number;
  lastActiveMs?: number;
  firstUserMessage: string;
  lastText: string;
  lastEventType?: string;
}

const VERBOSE_SYSTEM_EVENTS = new Set([
  "system.message",
  "session.info",
  "session.warning",
  "tool.execution_start",
  "tool.execution_complete",
  "function",
  "abort",
]);
const WAITING_EVENTS = new Set([
  "assistant.message",
  "assistant.turn_end",
  "session.shutdown",
  "abort",
]);

export interface CopilotSessionParserOptions {
  /** Cold-start scan bounds for `readSessionDirIncremental` (see IncrementalJsonlSummary). */
  summaryBounds?: JsonlSummaryBounds | false;
}

export class CopilotSessionParser {
  /** Incremental reader backing `getConversation({ tail })`. */
  private readonly tailReader = new JsonlTailReader();

  private readonly eventCache: IncrementalJsonlSummary<CopilotEventState>;

  constructor(options: CopilotSessionParserOptions = {}) {
    this.eventCache = new IncrementalJsonlSummary(this.eventReducer, {
      bounds: options.summaryBounds,
    });
  }

  /**
   * Fold one events.jsonl entry into the O(1) event summary. Mirrors the
   * original whole-file pass: the latest valid timestamp and event type win,
   * `session.start` overrides id/cwd/start, and user/assistant text is tracked.
   *
   * `skip` (bounded cold start) keeps the head's first user message and clears
   * the latest timestamp, event type and text, so those come from the tail
   * only. Tail entries never fill the first user message: beyond the head it
   * stays "" and the summary falls back to the tail's latest text. The
   * `session.start` fields (id, cwd, start) are kept from the head and, as in
   * a full scan, a later `session.start` in the tail still overrides them; one
   * only in the skipped middle is not seen.
   */
  private readonly eventReducer: JsonlSummaryReducer<CopilotEventState> = {
    initial: () => ({ entryCount: 0, firstUserMessage: "", lastText: "" }),
    reduce: (state, value) => {
      if (value === undefined) return state;
      const next: CopilotEventState = { ...state, entryCount: state.entryCount + 1 };
      if (!value || typeof value !== "object") return next;

      const entry = value as CopilotEventEntry;
      const timestampMs = parseTimestamp(entry.timestamp)?.getTime();
      if (timestampMs !== undefined) {
        next.lastActiveMs = timestampMs;
      }
      if (entry.type) {
        next.lastEventType = entry.type;
      }

      if (entry.type === "session.start") {
        next.sessionId = entry.data?.sessionId || next.sessionId;
        next.projectPath = entry.data?.context?.cwd || next.projectPath;
        next.sessionStartMs =
          parseTimestamp(entry.data?.startTime)?.getTime() ?? timestampMs ?? next.sessionStartMs;
        return next;
      }

      const text = this.extractEventText(entry, false);
      if (!text) return next;

      if (!next.firstUserMessage && !state.pastHead && entry.type === "user.message") {
        next.firstUserMessage = text;
      }
      if (entry.type === "user.message" || entry.type === "assistant.message") {
        next.lastText = text;
      }
      return next;
    },
    skip: (state) => ({
      entryCount: state.entryCount,
      pastHead: true,
      sessionId: state.sessionId,
      projectPath: state.projectPath,
      sessionStartMs: state.sessionStartMs,
      firstUserMessage: state.firstUserMessage,
      lastText: "",
    }),
  };

  readSessionDir(sessionDir: string, fallbackSessionId: string): CopilotSession | null {
    const eventsFilePath = path.join(sessionDir, "events.jsonl");
    const content = safeReadFile(eventsFilePath);
    const events =
      content === undefined
        ? this.eventReducer.initial()
        : reduceJsonlContent(this.eventReducer, content);
    return this.toSession(sessionDir, fallbackSessionId, events);
  }

  /**
   * Same result as `readSessionDir`, but events.jsonl is summarized through a
   * per-instance incremental cache so repeated refreshes only parse appended
   * bytes. Call `pruneSessionCache()` once per refresh.
   *
   * The first read of a large events.jsonl is a bounded head + tail scan (see
   * `eventReducer.skip`); fields whose entries lie only in the skipped middle
   * fall back to their defaults instead of forcing a full parse.
   */
  readSessionDirIncremental(sessionDir: string, fallbackSessionId: string): CopilotSession | null {
    const result = this.eventCache.read(path.join(sessionDir, "events.jsonl"));
    return this.toSession(
      sessionDir,
      fallbackSessionId,
      result?.state ?? this.eventReducer.initial(),
    );
  }

  /** Evict cached event summaries for files not read since the previous prune. */
  pruneSessionCache(): void {
    this.eventCache.prune();
  }

  private toSession(
    sessionDir: string,
    fallbackSessionId: string,
    events: CopilotEventState,
  ): CopilotSession | null {
    const eventsFilePath = path.join(sessionDir, "events.jsonl");
    const workspace = this.readWorkspaceMetadata(path.join(sessionDir, "workspace.yaml"));
    if (events.entryCount === 0 && !this.hasWorkspaceMetadata(workspace)) {
      return null;
    }

    const fileStat = safeStat(eventsFilePath);
    const defaultStart = workspace.createdAt || fileStat?.birthtime || new Date();
    const sessionStart =
      events.sessionStartMs !== undefined ? new Date(events.sessionStartMs) : defaultStart;
    const lastActive =
      events.lastActiveMs !== undefined
        ? new Date(events.lastActiveMs)
        : workspace.updatedAt || fileStat?.mtime || defaultStart;

    const summary =
      events.firstUserMessage || events.lastText || workspace.name || "Copilot session active";

    return {
      sessionId: events.sessionId || workspace.id || fallbackSessionId,
      projectPath: events.projectPath || workspace.cwd || "",
      summary: truncate(summary, SUMMARY_MAX_LENGTH),
      sessionStart,
      lastActive,
      lastEventType: events.lastEventType,
      firstUserMessage: events.firstUserMessage,
      eventsFilePath,
    };
  }

  getConversation(sessionFilePath: string, options?: ConversationOptions): ConversationMessage[] {
    const verbose = options?.verbose ?? false;
    const tail = normalizeTail(options?.tail);
    if (tail !== undefined) {
      return this.tailReader.read(
        sessionFilePath,
        tail,
        {
          parseLine: (line) => {
            const entry = this.parseEventLine(line);
            return entry ? this.eventToMessage(entry, verbose) : null;
          },
        },
        String(verbose),
      );
    }

    const content = safeReadFile(sessionFilePath);
    if (content === undefined) return [];

    const messages: ConversationMessage[] = [];

    for (const entry of this.parseEventLines(content)) {
      const message = this.eventToMessage(entry, verbose);
      if (message) messages.push(message);
    }

    return messages;
  }

  private eventToMessage(entry: CopilotEventEntry, verbose: boolean): ConversationMessage | null {
    const role = this.roleForEvent(entry.type, verbose);
    if (!role) return null;

    const text = this.extractEventText(entry, verbose);
    if (!text) return null;

    return {
      role,
      content: text,
      timestamp: entry.timestamp,
    };
  }

  determineStatus(session: CopilotSession): AgentStatus {
    if (isIdle(session.lastActive)) {
      return AgentStatus.IDLE;
    }

    if (session.lastEventType !== undefined && WAITING_EVENTS.has(session.lastEventType)) {
      return AgentStatus.WAITING;
    }

    return AgentStatus.RUNNING;
  }

  private hasWorkspaceMetadata(workspace: CopilotWorkspace): boolean {
    return Boolean(
      workspace.id || workspace.cwd || workspace.name || workspace.createdAt || workspace.updatedAt,
    );
  }

  private readWorkspaceMetadata(filePath: string): CopilotWorkspace {
    const content = safeReadFile(filePath);
    if (content === undefined) return {};

    const values = new Map<string, string>();
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const idx = line.indexOf(":");
      if (idx === -1) continue;

      const key = line.slice(0, idx).trim();
      const value = this.stripYamlScalar(line.slice(idx + 1).trim());
      values.set(key, value);
    }

    return {
      id: values.get("id"),
      cwd: values.get("cwd"),
      name: values.get("name"),
      createdAt: parseTimestamp(values.get("created_at")) || undefined,
      updatedAt: parseTimestamp(values.get("updated_at")) || undefined,
    };
  }

  private stripYamlScalar(value: string): string {
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }

  private parseEventLines(content: string): CopilotEventEntry[] {
    const entries: CopilotEventEntry[] = [];
    for (const line of content.trim().split("\n")) {
      const entry = this.parseEventLine(line);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  private parseEventLine(line: string): CopilotEventEntry | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    try {
      return JSON.parse(trimmed) as CopilotEventEntry;
    } catch {
      return null;
    }
  }

  private roleForEvent(
    type: string | undefined,
    verbose: boolean,
  ): ConversationMessage["role"] | null {
    if (type === "user.message") return "user";
    if (type === "assistant.message") return "assistant";
    if (verbose && type !== undefined && VERBOSE_SYSTEM_EVENTS.has(type)) {
      return "system";
    }
    return null;
  }

  private extractEventText(entry: CopilotEventEntry, verbose: boolean): string {
    const data = entry.data;
    if (!data) return "";

    const raw =
      data.content ||
      data.message ||
      data.text ||
      data.result?.content ||
      data.result?.detailedContent ||
      (verbose ? data.output : "") ||
      "";

    if (typeof raw !== "string") return "";
    return raw.trim();
  }
}
