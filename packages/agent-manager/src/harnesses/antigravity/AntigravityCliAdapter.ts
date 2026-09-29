import type {
  AgentAdapter,
  AgentDetectionContext,
  AgentInfo,
  ProcessInfo,
  ConversationMessage,
  ConversationOptions,
  SessionSummary,
  ListSessionsOptions,
} from "../../adapters/AgentAdapter.js";
import { findHarnessProcesses, matchesExecutable } from "../shared.js";
import { AntigravityAgentMapper } from "./AntigravityAgentMapper.js";
import { AntigravitySessionLocator } from "./AntigravitySessionLocator.js";
import { AntigravitySessionParser, type AntigravitySession } from "./AntigravitySessionParser.js";

/**
 * Antigravity CLI Adapter
 *
 * Detects running Antigravity CLI agents (Google's `agy` native binary) by:
 * 1. Filtering `agy` processes from the shared process snapshot.
 * 2. Resolving each process to its conversation via
 *    ~/.gemini/antigravity-cli/cache/last_conversations.json, a
 *    `{ <cwd>: <conversationId> }` map keyed by the process cwd.
 * 3. Reading brain/<conversationId>/.system_generated/logs/transcript.jsonl;
 *    the last user request is the summary.
 *
 * This is the runtime side of Antigravity, independent of the `antigravity`
 * environment that configures the Antigravity IDE.
 */
export class AntigravityCliAdapter implements AgentAdapter {
  readonly type = "antigravity_cli" as const;
  readonly processNames = ["agy"] as const;

  private parser: AntigravitySessionParser;
  private mapper: AntigravityAgentMapper;
  private locator: AntigravitySessionLocator;

  constructor() {
    this.parser = new AntigravitySessionParser();
    this.mapper = new AntigravityAgentMapper(this.parser);
    this.locator = new AntigravitySessionLocator();
  }

  canHandle(processInfo: ProcessInfo): boolean {
    return matchesExecutable(processInfo.command, "agy");
  }

  async detectAgents(context?: AgentDetectionContext): Promise<AgentInfo[]> {
    try {
      return await this.detectRunningAgents(context);
    } finally {
      // Drop cached summaries for sessions that were not part of this refresh
      this.parser.pruneSessionCache();
    }
  }

  private async detectRunningAgents(context?: AgentDetectionContext): Promise<AgentInfo[]> {
    const { processes } = await findHarnessProcesses(this, context);
    if (processes.length === 0) {
      return [];
    }

    const agents: AgentInfo[] = [];
    for (const { process: proc, cwd, conversation } of this.locator.matchRunningProcesses(
      processes,
    )) {
      const session = conversation
        ? this.parser.readSessionIncremental(
            conversation.conversationId,
            conversation.transcriptPath,
            cwd,
          )
        : null;
      if (session) {
        agents.push(this.mapper.mapSessionToAgent({ session, processInfo: proc }));
      } else {
        agents.push(this.mapper.mapProcessOnlyAgent(proc, cwd));
      }
    }
    return agents;
  }

  getConversation(sessionFilePath: string, options?: ConversationOptions): ConversationMessage[] {
    return this.parser.getConversation(sessionFilePath, options);
  }

  async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
    const filterCwd = opts?.cwd;
    const summaries: SessionSummary[] = [];

    for (const { cwd, conversationId, transcriptPath } of this.locator.listConversations()) {
      if (filterCwd !== undefined && cwd !== filterCwd) continue;

      const session = this.parser.readSession(conversationId, transcriptPath, cwd);
      if (!session) continue;

      summaries.push(this.toSessionSummary(session));
    }

    return summaries;
  }

  /** Only registered conversations are listed, so look the id up in the registry. */
  async findSessionsById(sessionId: string): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];
    for (const { cwd, conversationId, transcriptPath } of this.locator.listConversations()) {
      if (conversationId !== sessionId) continue;

      const session = this.parser.readSession(conversationId, transcriptPath, cwd);
      if (session) summaries.push(this.toSessionSummary(session));
    }
    return summaries;
  }

  private toSessionSummary(session: AntigravitySession): SessionSummary {
    return {
      type: this.type,
      sessionId: session.sessionId,
      cwd: session.projectPath,
      firstUserMessage: session.firstUserMessage || "",
      lastActive: session.lastActive,
      startedAt: session.sessionStart,
      sessionFilePath: session.sessionFilePath,
    };
  }
}
