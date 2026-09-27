import type {
  AgentAdapter,
  AgentInfo,
  ProcessInfo,
  ConversationMessage,
  SessionSummary,
  ListSessionsOptions,
  AgentDetectionContext,
} from "../../adapters/AgentAdapter.js";
import {
  captureProcessSnapshot,
  executableBasename,
  filterByProcessNames,
} from "../../utils/process.js";
import { GrokAgentMapper } from "./GrokAgentMapper.js";
import { GrokSessionLocator } from "./GrokSessionLocator.js";
import { GrokSessionParser, type GrokSession } from "./GrokSessionParser.js";

/**
 * Grok Build CLI Adapter
 *
 * Detects running Grok Build CLI agents by:
 * 1. Filtering `grok` processes from a shared asynchronous snapshot — Grok is
 *    a native binary at ~/.grok/bin/grok, so argv[0] basename is `grok`.
 * 2. Resolving each live process to its working directory via
 *    ~/.grok/active_sessions.json, which Grok maintains as a list of
 *    { pid, cwd, opened_at } for every running session. The cwd is then encoded
 *    into the session group dir ~/.grok/sessions/<encodeURIComponent(cwd)>/, and
 *    the most recently active session subdirectory is picked from it. The
 *    process cwd from lsof is only a fallback when the PID is not registered.
 * 3. Reading the session transcript from chat_history.jsonl (the authoritative
 *    record of the conversation). The last user turn (the text inside
 *    <user_query>...</user_query>) is the summary; the file's mtime is the last
 *    activity time. summary.json / updates.jsonl are intentionally not used.
 */
export class GrokCliAdapter implements AgentAdapter {
  readonly type = "grok_cli" as const;
  readonly processNames = ["grok"] as const;

  private parser: GrokSessionParser;
  private mapper: GrokAgentMapper;
  private locator: GrokSessionLocator;

  constructor() {
    this.parser = new GrokSessionParser();
    this.mapper = new GrokAgentMapper(this.parser);
    this.locator = new GrokSessionLocator();
  }

  canHandle(processInfo: ProcessInfo): boolean {
    return this.isGrokExecutable(processInfo.command);
  }

  private isGrokExecutable(command: string): boolean {
    const base = executableBasename(command);
    return base === "grok" || base === "grok.exe";
  }

  async detectAgents(context?: AgentDetectionContext): Promise<AgentInfo[]> {
    const snapshot = context?.processes ?? (await captureProcessSnapshot(this.processNames));
    const relevant = filterByProcessNames(snapshot, this.processNames);
    const processes = relevant.filter((process) => this.canHandle(process));
    if (processes.length === 0) {
      return [];
    }

    const agents: AgentInfo[] = [];
    for (const { process: proc, cwd, sessionDir } of this.locator.matchRunningProcesses(
      processes,
    )) {
      const session = sessionDir ? this.parser.readSession(sessionDir, cwd) : null;
      if (session) {
        agents.push(this.mapper.mapSessionToAgent({ session, processInfo: proc }));
      } else {
        agents.push(this.mapper.mapProcessOnlyAgent(proc, cwd));
      }
    }
    return agents;
  }

  getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
    return this.parser.getConversation(sessionFilePath, options);
  }

  async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
    const filterCwd = opts?.cwd;
    const summaries: SessionSummary[] = [];

    for (const { sessionDir, defaultCwd } of this.locator.discoverHistoricalSessionDirs()) {
      const session = this.parser.readSession(sessionDir, defaultCwd);
      if (!session) continue;

      if (filterCwd !== undefined && session.projectPath !== filterCwd) continue;

      summaries.push(this.toSessionSummary(session));
    }

    return summaries;
  }

  async findSessionsById(sessionId: string): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];
    for (const { sessionDir, defaultCwd } of this.locator.findHistoricalSessionDirsById(
      sessionId,
    )) {
      const session = this.parser.readSession(sessionDir, defaultCwd);
      if (!session) continue;

      summaries.push(this.toSessionSummary(session));
    }
    return summaries;
  }

  private toSessionSummary(session: GrokSession): SessionSummary {
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
