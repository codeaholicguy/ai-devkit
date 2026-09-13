import * as path from "path";
import type { ConversationMessage } from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import { safeReadFile, safeStat } from "../../utils/session.js";

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

interface CopilotEventSummary {
  sessionId: string;
  projectPath: string;
  sessionStart: Date;
  lastActive: Date;
  firstUserMessage: string;
  lastText: string;
  lastEventType?: string;
}

const IDLE_THRESHOLD_MINUTES = 5;
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

export class CopilotSessionParser {
  readSessionDir(sessionDir: string, fallbackSessionId: string): CopilotSession | null {
    const eventsFilePath = path.join(sessionDir, "events.jsonl");
    const workspace = this.readWorkspaceMetadata(path.join(sessionDir, "workspace.yaml"));
    const entries = this.readEventEntries(eventsFilePath);
    if (entries.length === 0 && !this.hasWorkspaceMetadata(workspace)) {
      return null;
    }

    const fileStat = safeStat(eventsFilePath);
    const sessionStart = workspace.createdAt || fileStat?.birthtime || new Date();
    const eventSummary = this.buildSessionFromEntries(entries, {
      sessionId: workspace.id || fallbackSessionId,
      projectPath: workspace.cwd || "",
      sessionStart,
      lastActive: workspace.updatedAt || fileStat?.mtime || sessionStart,
      firstUserMessage: "",
      lastText: "",
    });

    const summary =
      eventSummary.firstUserMessage ||
      eventSummary.lastText ||
      workspace.name ||
      "Copilot session active";

    return {
      sessionId: eventSummary.sessionId,
      projectPath: eventSummary.projectPath,
      summary: this.truncate(summary, 120),
      sessionStart: eventSummary.sessionStart,
      lastActive: eventSummary.lastActive,
      lastEventType: eventSummary.lastEventType,
      firstUserMessage: eventSummary.firstUserMessage,
      eventsFilePath,
    };
  }

  getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
    const verbose = options?.verbose ?? false;
    const content = safeReadFile(sessionFilePath);
    if (content === undefined) return [];

    const messages: ConversationMessage[] = [];

    for (const entry of this.parseEventLines(content)) {
      const role = this.roleForEvent(entry.type, verbose);
      if (!role) continue;

      const text = this.extractEventText(entry, verbose);
      if (!text) continue;

      messages.push({
        role,
        content: text,
        timestamp: entry.timestamp,
      });
    }

    return messages;
  }

  determineStatus(session: CopilotSession): AgentStatus {
    const diffMs = Date.now() - session.lastActive.getTime();
    const diffMinutes = diffMs / 60000;
    if (diffMinutes > IDLE_THRESHOLD_MINUTES) {
      return AgentStatus.IDLE;
    }

    if (session.lastEventType !== undefined && WAITING_EVENTS.has(session.lastEventType)) {
      return AgentStatus.WAITING;
    }

    return AgentStatus.RUNNING;
  }

  private readEventEntries(eventsFilePath: string): CopilotEventEntry[] {
    const content = safeReadFile(eventsFilePath);
    return content === undefined ? [] : this.parseEventLines(content);
  }

  private buildSessionFromEntries(
    entries: CopilotEventEntry[],
    initial: CopilotEventSummary,
  ): CopilotEventSummary {
    const summary = { ...initial };
    for (const entry of entries) {
      const timestamp = this.parseTimestamp(entry.timestamp);
      if (timestamp) {
        summary.lastActive = timestamp;
      }
      if (entry.type) {
        summary.lastEventType = entry.type;
      }

      if (entry.type === "session.start") {
        summary.sessionId = entry.data?.sessionId || summary.sessionId;
        summary.projectPath = entry.data?.context?.cwd || summary.projectPath;
        summary.sessionStart =
          this.parseTimestamp(entry.data?.startTime) || timestamp || summary.sessionStart;
        continue;
      }

      const text = this.extractEventText(entry, false);
      if (!text) continue;

      if (!summary.firstUserMessage && entry.type === "user.message") {
        summary.firstUserMessage = text;
      }

      if (entry.type === "user.message" || entry.type === "assistant.message") {
        summary.lastText = text;
      }
    }

    return summary;
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
      createdAt: this.parseTimestamp(values.get("created_at")) || undefined,
      updatedAt: this.parseTimestamp(values.get("updated_at")) || undefined,
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
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        entries.push(JSON.parse(trimmed) as CopilotEventEntry);
      } catch {
        continue;
      }
    }
    return entries;
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

  private parseTimestamp(value?: string): Date | null {
    if (!value) return null;
    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp;
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 3)}...`;
  }
}
