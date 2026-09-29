import * as path from "path";
import type { ProcessInfo } from "../../adapters/AgentAdapter.js";
import { safeReadFile } from "../../utils/session.js";
import { homeDir } from "../shared.js";

const REGISTRY_FILE = path.join("cache", "last_conversations.json");
const BRAIN_DIR = "brain";
const TRANSCRIPT_REL = path.join(".system_generated", "logs", "transcript.jsonl");

/** A workspace cwd and the conversation the CLI last used there. */
export interface AntigravityConversationRef {
  cwd: string;
  conversationId: string;
  transcriptPath: string;
}

/** A live `agy` process paired with its cwd and (if registered) conversation. */
export interface AntigravityProcessMatch {
  process: ProcessInfo;
  cwd: string;
  conversation: AntigravityConversationRef | null;
}

export interface AntigravitySessionLocatorOptions {
  /** Overrides the base dir (defaults to ANTIGRAVITY_CLI_HOME or ~/.gemini/antigravity-cli). */
  baseDir?: string;
}

export class AntigravitySessionLocator {
  private readonly baseDir: string;

  constructor(options: AntigravitySessionLocatorOptions = {}) {
    this.baseDir =
      options.baseDir ??
      (process.env.ANTIGRAVITY_CLI_HOME || path.join(homeDir(), ".gemini", "antigravity-cli"));
  }

  /** Pair live processes with their conversation, joined on the process cwd. */
  matchRunningProcesses(processes: ProcessInfo[]): AntigravityProcessMatch[] {
    const byCwd = new Map(this.listConversations().map((ref) => [ref.cwd, ref]));
    return processes.map((proc) => {
      const cwd = proc.cwd || "";
      return { process: proc, cwd, conversation: byCwd.get(cwd) ?? null };
    });
  }

  /**
   * Read cache/last_conversations.json, a `{ <cwd>: <conversationId> }` map the
   * CLI rewrites as the current conversation per workspace changes.
   */
  listConversations(): AntigravityConversationRef[] {
    const content = safeReadFile(path.join(this.baseDir, REGISTRY_FILE));
    if (content === undefined) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return [];
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

    const refs: AntigravityConversationRef[] = [];
    for (const [cwd, conversationId] of Object.entries(parsed as Record<string, unknown>)) {
      if (cwd && typeof conversationId === "string" && conversationId) {
        refs.push({ cwd, conversationId, transcriptPath: this.transcriptPath(conversationId) });
      }
    }
    return refs;
  }

  private transcriptPath(conversationId: string): string {
    return path.join(this.baseDir, BRAIN_DIR, conversationId, TRANSCRIPT_REL);
  }
}
