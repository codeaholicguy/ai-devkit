import * as path from "path";
import type { ConversationMessage, SessionSummary } from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import { safeReadFile, safeStat } from "../../utils/session.js";

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

const IDLE_THRESHOLD_MINUTES = 5;

export class PiSessionParser {
  readSession(filePath: string, fallbackCwd = ""): PiSession | null {
    const entries = this.readJsonl(filePath);
    if (entries.length === 0) return null;
    return this.sessionFromEntries(entries, filePath, fallbackCwd);
  }

  determineStatus(session: PiSession): AgentStatus {
    const diffMs = Date.now() - session.lastActive.getTime();
    const diffMinutes = diffMs / 60000;

    if (diffMinutes > IDLE_THRESHOLD_MINUTES) return AgentStatus.IDLE;
    if (session.lastRole === "assistant") return AgentStatus.WAITING;
    return AgentStatus.RUNNING;
  }

  getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
    const includeSystem = options?.verbose ?? false;
    return this.entriesToMessages(this.readJsonl(sessionFilePath), includeSystem);
  }

  fileToSessionSummary(filePath: string): SessionSummary | null {
    const entries = this.readJsonl(filePath);
    if (entries.length === 0) return null;

    const session = this.sessionFromEntries(entries, filePath);
    const firstUserMessage =
      this.entriesToMessages(entries, false).find((msg) => msg.role === "user")?.content ?? "";
    return {
      type: "pi",
      sessionId: session.sessionId,
      cwd: session.projectPath,
      firstUserMessage,
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

  private sessionFromEntries(entries: PiLine[], filePath: string, fallbackCwd = ""): PiSession {
    const stat = safeStat(filePath);
    const timestamps = entries
      .map((entry) => this.parseTimestamp(this.entryTimestamp(entry)))
      .filter((value): value is Date => value !== null);

    const sessionStart = timestamps[0] ?? stat?.birthtime ?? stat?.mtime ?? new Date();
    const lastActive = timestamps[timestamps.length - 1] ?? stat?.mtime ?? sessionStart;
    const messages = this.entriesToMessages(entries, true);
    const lastUser = [...messages].reverse().find((msg) => msg.role === "user");
    const lastMessage = messages[messages.length - 1];

    return {
      sessionId: this.sessionIdFromEntries(entries) || this.sessionIdFromFile(filePath),
      projectPath: this.cwdFromEntries(entries) || fallbackCwd,
      summary: lastUser?.content ? this.truncate(lastUser.content, 120) : "Pi session active",
      sessionStart,
      lastActive,
      lastRole: lastMessage?.role,
    };
  }

  private readJsonl(filePath: string): PiLine[] {
    const content = safeReadFile(filePath);
    if (content === undefined) return [];

    const entries: PiLine[] = [];
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          entries.push(parsed as PiLine);
        }
      } catch {
        continue;
      }
    }
    return entries;
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

  private sessionIdFromEntries(entries: PiLine[]): string | null {
    for (const entry of entries) {
      const sessionId = this.firstString(
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
      if (sessionId) return sessionId;
    }
    return null;
  }

  private cwdFromEntries(entries: PiLine[]): string {
    for (const entry of entries) {
      const cwd = this.firstString(
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
      if (cwd) return cwd;
    }
    return "";
  }

  private firstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === "string" && value) return value;
    }
    return undefined;
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
