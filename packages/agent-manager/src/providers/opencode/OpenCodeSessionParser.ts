import type { ConversationMessage } from "../../adapters/AgentAdapter.js";
import type Database from "better-sqlite3";

export interface OpenCodeSessionStats {
  lastRole: string | null;
  lastTimeUpdated: number;
  /** OpenCode writes `time.completed` on the assistant message only when the turn finishes. */
  lastAssistantCompleted: boolean;
  lastAssistantErrored: boolean;
  summary: string;
}

interface OpenCodePartData {
  type?: string;
  text?: string;
  reasoning?: string;
  tool?: string;
}

const EMPTY_STATS: OpenCodeSessionStats = {
  lastRole: null,
  lastTimeUpdated: 0,
  lastAssistantCompleted: false,
  lastAssistantErrored: false,
  summary: "",
};

export class OpenCodeSessionParser {
  getConversation(
    db: Database.Database,
    sessionId: string,
    options?: { verbose?: boolean },
  ): ConversationMessage[] {
    const verbose = options?.verbose ?? false;

    try {
      const rows = db
        .prepare<[string], { role: string; partData: string; timeCreated: number }>(`
                SELECT json_extract(m.data, '$.role') AS role,
                       p.data AS partData,
                       p.time_created AS timeCreated
                FROM part p
                JOIN message m ON p.message_id = m.id
                WHERE p.session_id = ?
                ORDER BY p.time_created ASC
            `)
        .all(sessionId);

      const messages: ConversationMessage[] = [];

      for (const row of rows) {
        const partData = this.parsePartData(row.partData);
        if (!partData) continue;

        const role = row.role === "user" ? "user" : "assistant";

        if (partData.type === "text" && partData.text) {
          messages.push({ role, content: partData.text });
        } else if (partData.type === "reasoning" && verbose) {
          const text = partData.reasoning || partData.text || "";
          if (text) messages.push({ role: "assistant", content: `[thinking] ${text}` });
        } else if (partData.type === "tool" && verbose) {
          const toolName = partData.tool || "tool";
          messages.push({ role: "assistant", content: `[tool: ${toolName}]` });
        }
      }

      return messages;
    } catch {
      return [];
    }
  }

  getSessionStats(db: Database.Database, sessionId: string): OpenCodeSessionStats {
    try {
      // Order by time_created — time_updated can lag when OpenCode appends
      // metadata (e.g. summary diffs) to user messages after a turn finishes.
      const last = db
        .prepare<[string], { role: string; timeUpdated: number }>(`
                SELECT json_extract(data, '$.role') AS role,
                       time_updated AS timeUpdated
                FROM message
                WHERE session_id = ?
                ORDER BY time_created DESC
                LIMIT 1
            `)
        .get(sessionId);

      const heartbeat = db
        .prepare<[string], { maxUpdated: number }>(`
                SELECT MAX(time_updated) AS maxUpdated FROM message WHERE session_id = ?
            `)
        .get(sessionId);

      const lastAssistant = db
        .prepare<
          [string],
          {
            completed: number | null;
            errored: number | null;
          }
        >(`
                SELECT json_extract(data, '$.time.completed') AS completed,
                       json_extract(data, '$.time.error') AS errored
                FROM message
                WHERE session_id = ? AND json_extract(data, '$.role') = 'assistant'
                ORDER BY time_created DESC
                LIMIT 1
            `)
        .get(sessionId);

      const first = db
        .prepare<[string], { text: string }>(`
                SELECT json_extract(p.data, '$.text') AS text
                FROM part p
                JOIN message m ON p.message_id = m.id
                WHERE p.session_id = ?
                  AND json_extract(m.data, '$.role') = 'user'
                  AND json_extract(p.data, '$.type') = 'text'
                  AND json_extract(p.data, '$.text') IS NOT NULL
                ORDER BY p.time_created ASC
                LIMIT 1
            `)
        .get(sessionId);

      return {
        lastRole: last?.role ?? null,
        lastTimeUpdated: heartbeat?.maxUpdated ?? last?.timeUpdated ?? 0,
        lastAssistantCompleted: lastAssistant?.completed != null,
        lastAssistantErrored: lastAssistant?.errored != null,
        summary: first?.text?.trim() ?? "",
      };
    } catch {
      return EMPTY_STATS;
    }
  }

  private parsePartData(partData: string): OpenCodePartData | null {
    try {
      return JSON.parse(partData) as OpenCodePartData;
    } catch {
      return null;
    }
  }
}
