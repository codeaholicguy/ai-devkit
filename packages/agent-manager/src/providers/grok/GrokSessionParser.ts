import * as path from "path";
import type { ConversationMessage, ConversationOptions } from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import { JsonlTailReader, normalizeTail } from "../../utils/jsonlTail.js";
import { safeReadFile, safeStat } from "../../utils/session.js";

export const CHAT_HISTORY_FILE = "chat_history.jsonl";
const IDLE_THRESHOLD_MINUTES = 5;

/** One line of chat_history.jsonl. */
interface ChatRecord {
  type?: string;
  content?: unknown;
}

interface ChatScan {
  messages: ConversationMessage[];
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

export class GrokSessionParser {
  /** Incremental reader backing `getConversation({ tail })`. */
  private readonly tailReader = new JsonlTailReader();

  /**
   * Parse a session directory into a {@link GrokSession} from its
   * chat_history.jsonl transcript. Returns null when the transcript is
   * missing — i.e. there is no real session to surface.
   */
  readSession(sessionDir: string, defaultCwd: string): GrokSession | null {
    const chatPath = path.join(sessionDir, CHAT_HISTORY_FILE);
    const chatStat = safeStat(chatPath);
    if (!chatStat) return null;

    const scan = this.parseChatHistory(chatPath, false);
    const dirStat = safeStat(sessionDir);
    const lastActive = chatStat.mtime;

    return {
      sessionId: path.basename(sessionDir),
      projectPath: defaultCwd,
      sessionFilePath: chatPath,
      sessionStart: dirStat?.birthtime || lastActive,
      lastActive,
      firstUserMessage: scan.firstUserMessage,
      lastUserMessage: scan.lastUserMessage,
      lastRole: scan.lastRole,
    };
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
    return this.parseChatHistory(chatPath, verbose).messages;
  }

  /**
   * Determine agent status from parsed session state.
   *
   * - past the idle threshold → IDLE
   * - last transcript turn is an assistant message → WAITING (awaiting user)
   * - otherwise (last turn was a user message, or unknown) → RUNNING
   */
  determineStatus(session: GrokSession): AgentStatus {
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
   * Single pass over chat_history.jsonl. Each line is a
   * { type: 'system' | 'user' | 'assistant', content } record where content is
   * either a string or an array of { type: 'text', text } blocks.
   *
   * Grok wraps the real user prompt in <user_query>...</user_query>; the other
   * user records are context injections (<user_info>, <system-reminder>, ...)
   * and are skipped so the summary is the actual prompt, not boilerplate.
   */
  private parseChatHistory(chatPath: string, verbose: boolean): ChatScan {
    const content = safeReadFile(chatPath);
    if (content === undefined) return { messages: [] };

    const messages: ConversationMessage[] = [];
    let lastRole: ConversationMessage["role"] | undefined;

    for (const line of content.trim().split("\n")) {
      const message = this.lineToMessage(line, verbose);
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
    };
  }

  /** Convert one chat_history.jsonl line into a message, or null when it is not one. */
  private lineToMessage(line: string, verbose: boolean): ConversationMessage | null {
    if (!line.trim()) return null;

    let record: ChatRecord;
    try {
      record = JSON.parse(line);
    } catch {
      return null;
    }

    const text = this.extractText(record.content);
    if (record.type === "user") {
      const query = this.extractUserQuery(text);
      if (query === null) return null; // context injection, not a real prompt
      return { role: "user", content: query };
    }
    if (record.type === "assistant") {
      return text ? { role: "assistant", content: text } : null;
    }
    if (verbose && record.type === "system") {
      return text ? { role: "system", content: text } : null;
    }
    return null;
  }

  /** Flatten a chat record's content (string or text-block array) to text. */
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
