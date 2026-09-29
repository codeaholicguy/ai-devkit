import * as path from "path";
import type {
  AgentAdapter,
  AgentInfo,
  ProcessInfo,
  ConversationMessage,
  ConversationOptions,
  SessionSummary,
  ListSessionsOptions,
  AgentDetectionContext,
} from "../../adapters/AgentAdapter.js";
import { executablePath } from "../../utils/process.js";
import { findHarnessProcesses } from "../shared.js";
import { KiroAgentMapper } from "./KiroAgentMapper.js";
import { KiroSessionLocator } from "./KiroSessionLocator.js";
import { KiroSessionParser, type KiroSession } from "./KiroSessionParser.js";

const KIRO_BASENAMES = new Set(["kiro-cli", "kiro"]);
const SCRIPT_RUNTIMES = new Set(["node", "bun"]);

/**
 * Kiro Adapter
 *
 * Detects running Kiro agents by matching the PID in each
 * ~/.kiro/sessions/cli/<session-id>.lock to a running Kiro process (walking up
 * from helper processes such as `kiro-cli-chat acp`), then reading the sibling
 * <session-id>.json metadata and <session-id>.jsonl transcript.
 */
export class KiroAdapter implements AgentAdapter {
  readonly type = "kiro" as const;
  /**
   * Also collects the helpers between a lock holder and its kiro-cli, such as
   * the bundled `bun … tui.js`; `canHandle` still decides which are agents.
   */
  readonly processNames = ["kiro-cli", "kiro", "kiro-cli-chat", "node", "bun"] as const;

  private parser: KiroSessionParser;
  private mapper: KiroAgentMapper;
  private locator: KiroSessionLocator;

  constructor() {
    this.parser = new KiroSessionParser();
    this.mapper = new KiroAgentMapper(this.parser);
    this.locator = new KiroSessionLocator();
  }

  canHandle(processInfo: ProcessInfo): boolean {
    return this.isKiroExecutable(processInfo.command);
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
    const { relevant, processes } = await findHarnessProcesses(this, context);
    if (processes.length === 0) return [];

    const agents: AgentInfo[] = [];
    const matchedPids = new Set<number>();
    for (const match of this.locator.matchRunningProcesses(relevant, processes, (process) =>
      this.canHandle(process),
    )) {
      const session = this.parser.readSessionIncremental(match.session, match.process.cwd);
      if (!session) continue;

      agents.push(this.mapper.mapSessionToAgent({ session, processInfo: match.process }));
      matchedPids.add(match.process.pid);
    }

    for (const proc of processes) {
      if (!matchedPids.has(proc.pid)) {
        agents.push(this.mapper.mapProcessOnlyAgent(proc));
      }
    }
    return agents;
  }

  getConversation(sessionFilePath: string, options?: ConversationOptions): ConversationMessage[] {
    return this.parser.getConversation(sessionFilePath, options);
  }

  async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];
    for (const paths of this.locator.listSessions()) {
      const session = this.parser.readSession(paths);
      if (!session) continue;
      if (opts?.cwd !== undefined && session.projectPath !== opts.cwd) continue;

      summaries.push(this.toSessionSummary(session));
    }
    return summaries;
  }

  async findSessionsById(sessionId: string): Promise<SessionSummary[]> {
    const paths = this.locator.findSession(sessionId);
    const session = paths ? this.parser.readSession(paths) : null;
    // listSessions reports the metadata's id, so only an exact match counts.
    return session?.sessionId === sessionId ? [this.toSessionSummary(session)] : [];
  }

  private toSessionSummary(session: KiroSession): SessionSummary {
    return {
      type: this.type,
      sessionId: session.sessionId,
      cwd: session.projectPath,
      firstUserMessage: session.firstUserMessage,
      lastActive: session.lastActive,
      startedAt: session.sessionStart,
      sessionFilePath: session.sessionFilePath,
    };
  }

  /** `kiro-cli` / `kiro`, directly or as a script run by node or bun. */
  private isKiroExecutable(command: string): boolean {
    const trimmed = command.trim();
    const executable = executablePath(trimmed);
    if (!executable) return false;

    const executableName = kiroBasename(executable);
    if (KIRO_BASENAMES.has(executableName)) return true;
    if (!SCRIPT_RUNTIMES.has(executableName)) return false;

    const args = trimmed.slice(executable.length).trim().split(/\s+/);
    const scriptIndex = args.findIndex((token) => token !== "" && !token.startsWith("-"));
    if (scriptIndex === -1) return false;
    // The script path may also contain spaces; resolve it like argv[0].
    const script = executablePath(args.slice(scriptIndex).join(" "));
    return KIRO_BASENAMES.has(kiroBasename(script));
  }
}

function kiroBasename(executable: string): string {
  return path
    .basename(executable.replace(/\\/g, "/"))
    .toLowerCase()
    .replace(/\.(exe|js)$/, "");
}
