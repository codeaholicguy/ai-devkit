import type { ConversationMessage, ConversationOptions } from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import { JsonlTailReader, normalizeTail } from "../../utils/jsonlTail.js";
import { safeReadFile, safeStat } from "../../utils/session.js";

const IDLE_THRESHOLD_MINUTES = 5;

/** One line of transcript.jsonl. */
interface TranscriptRecord {
  source?: string;
  type?: string;
  created_at?: string;
  content?: unknown;
}

interface TranscriptScan {
  messages: ConversationMessage[];
  firstUserMessage?: string;
  lastUserMessage?: string;
  lastRole?: ConversationMessage["role"];
  lastActive?: Date;
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

export class AntigravitySessionParser {
  /** Incremental reader backing `getConversation({ tail })`. */
  private readonly tailReader = new JsonlTailReader();

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

    const scan = this.parseTranscript(transcriptPath, false);
    return {
      sessionId: conversationId,
      projectPath,
      sessionFilePath: transcriptPath,
      sessionStart: stat.birthtime,
      lastActive: scan.lastActive ?? stat.mtime,
      firstUserMessage: scan.firstUserMessage,
      lastUserMessage: scan.lastUserMessage,
      lastRole: scan.lastRole,
    };
  }

  getConversation(transcriptPath: string, options?: ConversationOptions): ConversationMessage[] {
    const verbose = options?.verbose ?? false;
    const tail = normalizeTail(options?.tail);
    if (tail === undefined) {
      return this.parseTranscript(transcriptPath, verbose).messages;
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
    const diffMinutes = (Date.now() - session.lastActive.getTime()) / 60000;
    if (diffMinutes > IDLE_THRESHOLD_MINUTES) {
      return AgentStatus.IDLE;
    }
    if (session.lastRole === "assistant") {
      return AgentStatus.WAITING;
    }
    return AgentStatus.RUNNING;
  }

  /**
   * Single pass over transcript.jsonl. Each line is a
   * { source, type, created_at, content } record; the latest created_at is the
   * last-activity time.
   */
  private parseTranscript(transcriptPath: string, verbose: boolean): TranscriptScan {
    const content = safeReadFile(transcriptPath);
    if (content === undefined) return { messages: [] };

    const messages: ConversationMessage[] = [];
    let lastRole: ConversationMessage["role"] | undefined;
    let lastActive: Date | undefined;

    for (const line of content.trim().split("\n")) {
      const record = this.parseRecord(line);
      if (!record) continue;

      const at = this.parseTimestamp(record.created_at);
      if (at && (!lastActive || at.getTime() > lastActive.getTime())) lastActive = at;

      const message = this.recordToMessage(record, verbose);
      if (!message) continue;
      messages.push(message);
      if (message.role !== "system") lastRole = message.role;
    }

    const userTurns = messages.filter((m) => m.role === "user");
    return {
      messages,
      firstUserMessage: userTurns[0]?.content,
      lastUserMessage: userTurns[userTurns.length - 1]?.content,
      lastRole,
      lastActive,
    };
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
    const text = this.extractText(record.content);
    if (record.type === "USER_INPUT") {
      const request = this.extractUserRequest(text);
      return request === null ? null : { role: "user", content: request };
    }
    if (!text) return null;
    if (record.type === "PLANNER_RESPONSE") return { role: "assistant", content: text };
    return verbose ? { role: "system", content: text } : null;
  }

  /** Flatten a record's content (string or text-block array) to text. */
  private extractText(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((block) =>
          block &&
          typeof block === "object" &&
          typeof (block as { text?: unknown }).text === "string"
            ? (block as { text: string }).text
            : "",
        )
        .join("");
    }
    return "";
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

  private parseTimestamp(value?: string): Date | null {
    if (!value) return null;
    const ts = new Date(value);
    return Number.isNaN(ts.getTime()) ? null : ts;
  }
}
