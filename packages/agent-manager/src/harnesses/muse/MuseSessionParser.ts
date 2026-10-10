import * as fs from "fs";
import * as path from "path";
import type { ConversationMessage, ConversationOptions } from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import {
  IncrementalJsonlSummary,
  reduceJsonlContent,
  type JsonlSummaryReducer,
} from "../../utils/IncrementalJsonlSummary.js";
import { JsonlTailReader, normalizeTail } from "../../utils/jsonlTail.js";

/**
 * A single unwrapped inner record from a Muse session frame.
 *
 * Each session.jsonl line is one of: a direct inner record, a
 * `{ record_json: string }` envelope, or a `retained_frame` wrapper whose
 * `children[]` carry `record_json` strings. Inner records dispatch on
 * `payload_type`; timestamps (`recorded_at`) are microseconds.
 */
export interface MuseInnerRecord {
  stream?: { kind?: string; id?: string };
  sequence?: number;
  recorded_at?: number;
  record_type?: string;
  payload_type?: string;
  payload?: Record<string, unknown>;
}

/** Parsed session state extracted from a Muse transcript. */
export interface MuseSession {
  sessionId: string;
  projectPath: string;
  /** Last display name from `session.name.changed`, when present. */
  displayName?: string;
  modelId?: string;
  sessionStart: Date;
  lastActive: Date;
  /** Last conversation signal: user-intent, assistant reply, approval, tool batch… */
  lastSignal?: string;
  lastUserMessage?: string;
  /** First meaningful user prompt in the session. */
  firstUserMessage?: string;
}

interface MuseSummaryState {
  seenFirstLine: boolean;
  pastHead?: boolean;
  sessionStartMs?: number;
  lastActiveMs?: number;
  workspaceRoot?: string;
  modelId?: string;
  displayName?: string;
  lastSignal?: string;
  lastUserMessage?: string;
  firstUserMessage?: string;
}

/**
 * Conversation-relevant shape of one inner record. Both the summary fold and
 * the message reader switch on this instead of re-matching payload shapes.
 */
type MuseRecordKind =
  | "metadata"
  | "name-changed"
  | "user-intent"
  | "assistant"
  | "tool-calls"
  | "approval-started"
  | "approval-settled"
  | "input-requested"
  | "input-settled"
  | "run-terminal"
  | "other";

function classifyRecord(record: MuseInnerRecord): MuseRecordKind {
  const payload = record.payload;
  if (!isRecord(payload)) return "other";
  switch (record.payload_type) {
    case "runtime.session.metadata":
      return "metadata";
    case "session.name.changed":
      return "name-changed";
    case "runtime.user_intent.accepted":
    case "runtime.user_intent.materialized":
      return "user-intent";
    case "runtime.session":
      break;
    default:
      return "other";
  }
  if (!isRecord(payload.event) || typeof payload.event.kind !== "string") return "other";
  if (payload.kind === "run") {
    switch (payload.event.kind) {
      case "assistant_message_committed":
        return "assistant";
      case "assistant_tool_calls_committed":
        return "tool-calls";
      case "terminal":
        return "run-terminal";
    }
  }
  switch (payload.event.kind) {
    case "approval_wait.effect.started":
      return "approval-started";
    case "approval_wait.effect.terminal":
      return "approval-settled";
    case "user_input_prompt_requested":
      return "input-requested";
    case "user_input_prompt_settled":
      return "input-settled";
    default:
      return "other";
  }
}

const MICROSECONDS_THRESHOLD = 1_000_000_000_000_000;

/** `recorded_at` microseconds → epoch ms; null when invalid. */
export function museTimestampToMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const ms = value >= MICROSECONDS_THRESHOLD ? Math.floor(value / 1000) : value;
  return ms >= 0 ? ms : null;
}

/** Unwrap one raw frame line into zero or more inner records. */
export function unwrapFrameRecords(line: string): MuseInnerRecord[] {
  let outer: unknown;
  try {
    outer = JSON.parse(line);
  } catch {
    return [];
  }
  return unwrapOuterRecords(outer);
}

/** Unwrap an already-parsed frame value into zero or more inner records. */
export function unwrapOuterRecords(outer: unknown): MuseInnerRecord[] {
  if (!outer || typeof outer !== "object") return [];
  const obj = outer as { record_json?: unknown; children?: unknown };
  if (typeof obj.record_json === "string") {
    try {
      const inner = JSON.parse(obj.record_json) as MuseInnerRecord;
      return [inner];
    } catch {
      return [];
    }
  }
  if (Array.isArray(obj.children)) {
    const out: MuseInnerRecord[] = [];
    for (const child of obj.children) {
      if (
        child &&
        typeof child === "object" &&
        typeof (child as { record_json?: unknown }).record_json === "string"
      ) {
        try {
          out.push(JSON.parse((child as { record_json: string }).record_json));
        } catch {
          /* skip malformed child */
        }
      }
    }
    return out;
  }
  return [obj as MuseInnerRecord];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Collect `{ kind: "text", text }` strings from intent/model message blocks. */
function collectTextBlocks(value: unknown): string[] {
  const out: string[] = [];
  if (Array.isArray(value)) {
    for (const block of value) {
      if (isRecord(block) && block.kind === "text") {
        const text = nonEmptyText(block.text);
        if (text) out.push(text);
      }
    }
  }
  return out;
}

/** User turn text from an intent payload (`refill_blocks` then `model_messages`). */
function intentText(payload: Record<string, unknown>): string | null {
  const refill = collectTextBlocks(payload.refill_blocks);
  if (refill.length > 0) return refill.join("\n");
  const modelMessages = payload.model_messages;
  if (Array.isArray(modelMessages)) {
    const parts: string[] = [];
    for (const message of modelMessages) {
      if (isRecord(message)) parts.push(...collectTextBlocks(message.content));
    }
    if (parts.length > 0) return parts.join("\n");
  }
  return null;
}

/** Assistant reply text from a `run.assistant_message_committed` event. */
function assistantEventText(event: Record<string, unknown>): string | null {
  return nonEmptyText(event.text);
}

export class MuseSessionParser {
  private readonly tailReader = new JsonlTailReader();
  private readonly sessionCache: IncrementalJsonlSummary<MuseSummaryState>;

  constructor() {
    this.sessionCache = new IncrementalJsonlSummary(this.summaryReducer, {});
  }

  readSession(filePath: string, projectPath: string): MuseSession | null {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
    if (!content.trim()) return null;
    return this.toSession(filePath, projectPath, reduceJsonlContent(this.summaryReducer, content));
  }

  readSessionIncremental(filePath: string, projectPath: string): MuseSession | null {
    const result = this.sessionCache.read(filePath);
    return result ? this.toSession(filePath, projectPath, result.state) : null;
  }

  pruneSessionCache(): void {
    this.sessionCache.prune();
  }

  private readonly summaryReducer: JsonlSummaryReducer<MuseSummaryState> = {
    initial: () => ({ seenFirstLine: false }),
    reduce: (state, value) => {
      const next: MuseSummaryState = { ...state, seenFirstLine: true };
      // Session start comes from the first line only; the first user message
      // may come from anywhere before a bounded-skip (mirrors Claude semantics).
      const flags = { isHead: !state.seenFirstLine, canBeFirst: !state.pastHead };
      for (const record of unwrapOuterRecords(value)) {
        this.foldRecord(next, record, flags);
      }
      return next;
    },
    skip: (state) => ({
      seenFirstLine: true,
      pastHead: true,
      sessionStartMs: state.sessionStartMs,
      firstUserMessage: state.firstUserMessage,
    }),
  };

  /**
   * Fold one inner record into the summary. `isHead` marks the first line
   * (session start only); `canBeFirst` allows the first user message from any
   * line read before a bounded-skip.
   */
  private foldRecord(
    next: MuseSummaryState,
    record: MuseInnerRecord,
    flags: { isHead: boolean; canBeFirst: boolean },
  ): void {
    const { isHead, canBeFirst } = flags;
    const atMs = museTimestampToMs(record.recorded_at);
    if (atMs !== null) {
      if (isHead && next.sessionStartMs === undefined) next.sessionStartMs = atMs;
      next.lastActiveMs = atMs;
    }
    const payload = record.payload;
    if (!isRecord(payload)) return;
    switch (classifyRecord(record)) {
      case "metadata": {
        if (!isRecord(payload.record)) return;
        const root = nonEmptyText(payload.record.workspace_root);
        if (root) next.workspaceRoot = root;
        const model = nonEmptyText(payload.record.model_id);
        if (model) next.modelId = model;
        return;
      }
      case "name-changed": {
        const name = nonEmptyText(payload.new_name);
        if (name) next.displayName = name;
        return;
      }
      case "user-intent": {
        next.lastSignal = "user-intent";
        const text = intentText(payload);
        if (text) {
          next.lastUserMessage = text;
          if (canBeFirst && !next.firstUserMessage) next.firstUserMessage = text;
        }
        return;
      }
      case "assistant":
        next.lastSignal = "assistant";
        return;
      case "approval-started":
        next.lastSignal = "approval-wait";
        return;
      case "approval-settled":
        if (next.lastSignal === "approval-wait") next.lastSignal = "assistant";
        return;
      case "input-requested":
        next.lastSignal = "input-requested";
        return;
      case "input-settled":
        if (next.lastSignal === "input-requested") next.lastSignal = "assistant";
        return;
      case "run-terminal":
        next.lastSignal = "run-terminal";
        return;
      default:
        return;
    }
  }

  private toSession(filePath: string, projectPath: string, state: MuseSummaryState): MuseSession {
    const sessionStartMs = state.sessionStartMs ?? state.lastActiveMs;
    return {
      sessionId: path.basename(path.dirname(filePath)),
      projectPath: projectPath || state.workspaceRoot || "",
      displayName: state.displayName,
      modelId: state.modelId,
      sessionStart: sessionStartMs !== undefined ? new Date(sessionStartMs) : new Date(),
      lastActive: state.lastActiveMs !== undefined ? new Date(state.lastActiveMs) : new Date(),
      lastSignal: state.lastSignal,
      lastUserMessage: state.lastUserMessage,
      firstUserMessage: state.firstUserMessage,
    };
  }

  /**
   * Status mapping over the last conversation signal:
   * - user-intent → RUNNING (agent is processing the new turn)
   * - assistant → WAITING (reply committed, awaiting user)
   * - approval-wait / input-requested → WAITING (blocked on the user)
   * - run-terminal → IDLE; no signal → UNKNOWN.
   */
  determineStatus(session: MuseSession): AgentStatus {
    switch (session.lastSignal) {
      case "user-intent":
        return AgentStatus.RUNNING;
      case "assistant":
      case "approval-wait":
      case "input-requested":
        return AgentStatus.WAITING;
      case "run-terminal":
        return AgentStatus.IDLE;
      default:
        return AgentStatus.UNKNOWN;
    }
  }

  getConversation(sessionFilePath: string, options?: ConversationOptions): ConversationMessage[] {
    const verbose = options?.verbose ?? false;
    const tail = normalizeTail(options?.tail);
    if (tail !== undefined) {
      return this.tailReader.read(
        sessionFilePath,
        tail,
        { parseLine: (line) => this.lineToMessage(line, verbose) },
        String(verbose),
      );
    }
    let content: string;
    try {
      content = fs.readFileSync(sessionFilePath, "utf-8");
    } catch {
      return [];
    }
    const messages: ConversationMessage[] = [];
    for (const line of content.trim().split("\n")) {
      messages.push(...this.linesToMessages(line, verbose));
    }
    return messages;
  }

  /** One raw frame line → conversation messages (usually zero or one). */
  private linesToMessages(line: string, verbose: boolean): ConversationMessage[] {
    const out: ConversationMessage[] = [];
    for (const record of unwrapFrameRecords(line)) {
      const message = this.recordToMessage(record, verbose);
      if (message) out.push(message);
    }
    return out;
  }

  /**
   * One raw frame line → its first conversation message, for tail reads.
   * A retained frame can theoretically hold several messages; the tail
   * window counts lines, so a boundary line keeps only its first message.
   */
  private lineToMessage(line: string, verbose: boolean): ConversationMessage | null {
    return this.linesToMessages(line, verbose)[0] ?? null;
  }

  private recordToMessage(record: MuseInnerRecord, verbose: boolean): ConversationMessage | null {
    const payload = record.payload;
    if (!isRecord(payload)) return null;
    const atMs = museTimestampToMs(record.recorded_at);
    const timestamp = atMs !== null ? new Date(atMs).toISOString() : undefined;

    switch (classifyRecord(record)) {
      case "user-intent": {
        const text = intentText(payload);
        if (!text) return null;
        return { role: "user", content: text, timestamp };
      }
      case "assistant": {
        if (!isRecord(payload.event)) return null;
        const text = assistantEventText(payload.event);
        if (!text) return null;
        return { role: "assistant", content: text, timestamp };
      }
      case "tool-calls": {
        if (!verbose || !isRecord(payload.event) || !Array.isArray(payload.event.tool_calls)) {
          return null;
        }
        const names = (payload.event.tool_calls as unknown[])
          .filter(isRecord)
          .map((call) => nonEmptyText(call.tool_name))
          .filter((name): name is string => name !== null);
        if (names.length === 0) return null;
        return { role: "assistant", content: `tool calls: ${names.join(", ")}`, timestamp };
      }
      default:
        return null;
    }
  }
}
