import type { ConversationMessage, ConversationOptions } from "../../adapters/AgentAdapter.js";
import { sliceTail } from "../../utils/jsonlTail.js";
import { SUMMARY_MAX_LENGTH, truncate } from "../shared.js";
import type Database from "better-sqlite3";

export interface DevinSessionStats {
  lastRole: string | null;
  /** Epoch milliseconds of the newest message node. */
  lastTimeUpdated: number;
  summary: string;
}

interface DevinChatMessage {
  message_id?: string;
  role?: string;
  content?: unknown;
  tool_calls?: { name?: string; function?: { name?: string } }[];
  thinking?: { thinking?: string } | string;
  name?: string;
  metadata?: { is_user_input?: boolean };
}

interface MessageNodeRow {
  node_id: number;
  chat_message: string;
}

const EMPTY_STATS: DevinSessionStats = {
  lastRole: null,
  lastTimeUpdated: 0,
  summary: "",
};

/** Rows fetched per requested tail message; revisions/tools eat into the window. */
const TAIL_OVERFETCH = 8;
const TOOL_CONTENT_MAX = 500;

export class DevinSessionParser {
  getConversation(
    db: Database.Database,
    sessionId: string,
    options?: ConversationOptions,
  ): ConversationMessage[] {
    const verbose = options?.verbose ?? false;
    const tail =
      options?.tail && Number.isInteger(options.tail) && options.tail > 0
        ? options.tail
        : undefined;

    try {
      // LIMIT -1 = unbounded in SQLite; one query serves the full and tail paths.
      const limit = tail ? tail * TAIL_OVERFETCH : -1;
      const rows = db
        .prepare<[string, number], MessageNodeRow>(`
                SELECT node_id, chat_message
                FROM message_nodes
                WHERE session_id = ?
                ORDER BY node_id DESC
                LIMIT ?
            `)
        .all(sessionId, limit)
        .reverse();

      const messages: ConversationMessage[] = [];
      const latestNodeByMessageId = new Map<string, number>();
      const parsed: { nodeId: number; message: DevinChatMessage }[] = [];

      for (const row of rows) {
        const message = this.parseChatMessage(row.chat_message);
        if (!message) continue;
        parsed.push({ nodeId: row.node_id, message });
        if (message.message_id) {
          latestNodeByMessageId.set(
            message.message_id,
            Math.max(latestNodeByMessageId.get(message.message_id) ?? 0, row.node_id),
          );
        }
      }

      for (const { nodeId, message } of parsed) {
        if (
          message.message_id &&
          latestNodeByMessageId.get(message.message_id) !== nodeId
        ) {
          continue;
        }

        const role = message.role;
        if (role === "system") continue;

        const content = typeof message.content === "string" ? message.content : "";

        if (role === "user") {
          if (message.metadata?.is_user_input === false || !content.trim()) continue;
          messages.push({ role: "user", content });
          continue;
        }

        if (role === "assistant") {
          const thinking =
            typeof message.thinking === "string"
              ? message.thinking
              : message.thinking?.thinking;
          if (verbose && thinking) {
            messages.push({ role: "assistant", content: `[thinking] ${thinking}` });
          }
          if (content.trim()) messages.push({ role: "assistant", content });
          if (verbose) {
            for (const call of message.tool_calls ?? []) {
              const name = call.function?.name ?? call.name ?? "tool";
              messages.push({ role: "assistant", content: `[tool: ${name}]` });
            }
          }
          continue;
        }

        if (role === "tool" && verbose) {
          const label = message.name ? `[tool: ${message.name}]` : "[tool]";
          messages.push({
            role: "assistant",
            content: `${label} ${truncate(content.trim(), TOOL_CONTENT_MAX)}`.trim(),
          });
        }
      }

      return sliceTail(messages, tail);
    } catch {
      return [];
    }
  }

  getSessionStats(db: Database.Database, sessionId: string): DevinSessionStats {
    try {
      const frontier = db
        .prepare<[string], { chat_message: string }>(`
                SELECT chat_message
                FROM message_nodes
                WHERE session_id = ?
                ORDER BY node_id DESC
                LIMIT 1
            `)
        .get(sessionId);

      const heartbeat = db
        .prepare<[string], { maxCreated: number | null }>(`
                SELECT MAX(created_at) AS maxCreated
                FROM message_nodes
                WHERE session_id = ?
            `)
        .get(sessionId);

      return {
        lastRole: this.parseChatMessage(frontier?.chat_message ?? "")?.role ?? null,
        lastTimeUpdated: (heartbeat?.maxCreated ?? 0) * 1000,
        summary: this.getLastUserPrompt(db, sessionId),
      };
    } catch {
      return EMPTY_STATS;
    }
  }

  /**
   * Most recent typed prompt for the "working on" summary, matching the
   * last-user-message convention of the other adapters.
   */
  getLastUserPrompt(db: Database.Database, sessionId: string): string {
    return this.userPrompt(db, sessionId, "DESC");
  }

  /**
   * First typed prompt for session-list identity (`firstUserMessage`).
   */
  getFirstUserMessage(db: Database.Database, sessionId: string): string {
    return this.userPrompt(db, sessionId, "ASC");
  }

  /**
   * Typed prompt in the given direction. `prompt_history` is authoritative;
   * shell `!` commands and `/` slash commands are skipped. Falls back to a
   * bounded `is_user_input` node scan in the same direction.
   */
  private userPrompt(
    db: Database.Database,
    sessionId: string,
    direction: "ASC" | "DESC",
  ): string {
    try {
      const prompt = db
        .prepare<[string], { content: string }>(`
                SELECT content
                FROM prompt_history
                WHERE session_id = ? AND is_shell = 0 AND content NOT LIKE '/%'
                ORDER BY timestamp ${direction}
                LIMIT 1
            `)
        .get(sessionId);
      if (prompt?.content?.trim()) return truncate(prompt.content.trim(), SUMMARY_MAX_LENGTH);
    } catch {
      /* fall through to message_nodes */
    }

    try {
      const rows = db
        .prepare<[string], { chat_message: string }>(`
                SELECT chat_message
                FROM message_nodes
                WHERE session_id = ? AND json_extract(chat_message, '$.role') = 'user'
                ORDER BY node_id ${direction}
                LIMIT 8
            `)
        .all(sessionId);
      for (const row of rows) {
        const message = this.parseChatMessage(row.chat_message);
        if (
          message?.role === "user" &&
          message.metadata?.is_user_input !== false &&
          typeof message.content === "string" &&
          message.content.trim()
        ) {
          return truncate(message.content.trim(), SUMMARY_MAX_LENGTH);
        }
      }
    } catch {
      /* ignore */
    }
    return "";
  }

  private parseChatMessage(raw: string): DevinChatMessage | null {
    try {
      return JSON.parse(raw) as DevinChatMessage;
    } catch {
      return null;
    }
  }
}
