/**
 * OpenCode Adapter
 *
 * Detects running OpenCode agents by:
 * 1. Filtering OpenCode processes from a shared asynchronous process snapshot
 * 2. Using snapshot CWD and start-time enrichment
 * 3. Querying OpenCode's SQLite DB (~/.local/share/opencode/opencode.db) to
 *    find the session matching each process's CWD and read status from message.time.completed
 *
 * sessionFilePath encodes "<dbPath>::<sessionId>" so getConversation() can open the right
 * DB row without extending the AgentAdapter interface.
 */

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
import { OpenCodeAgentMapper } from "./OpenCodeAgentMapper.js";
import { OpenCodeSessionLocator } from "./OpenCodeSessionLocator.js";
import { OpenCodeSessionParser } from "./OpenCodeSessionParser.js";

const SESSION_REF_SEP = "::";

function decodeSessionRef(ref: string): { sessionId: string } | null {
  const idx = ref.lastIndexOf(SESSION_REF_SEP);
  if (idx === -1) return null;
  return { sessionId: ref.slice(idx + SESSION_REF_SEP.length) };
}

export class OpenCodeAdapter implements AgentAdapter {
  readonly type = "opencode" as const;
  readonly processNames = ["opencode"] as const;

  private readonly parser: OpenCodeSessionParser;
  private readonly locator: OpenCodeSessionLocator;
  private readonly mapper: OpenCodeAgentMapper;
  private readonly cleanup = (): void => this.close();

  constructor(dbPath?: string) {
    this.parser = new OpenCodeSessionParser();
    this.locator = new OpenCodeSessionLocator(dbPath, this.parser);
    this.mapper = new OpenCodeAgentMapper(this.locator.dbFilePath);
    process.once("exit", this.cleanup);
    process.once("SIGINT", this.cleanup);
    process.once("SIGTERM", this.cleanup);
  }

  close(): void {
    process.off("exit", this.cleanup);
    process.off("SIGINT", this.cleanup);
    process.off("SIGTERM", this.cleanup);
    this.locator.close();
  }

  canHandle(processInfo: ProcessInfo): boolean {
    const base = executableBasename(processInfo.command);
    return base === "opencode" || base === "opencode.exe";
  }

  async detectAgents(context?: AgentDetectionContext): Promise<AgentInfo[]> {
    const snapshot = context?.processes ?? (await captureProcessSnapshot(this.processNames));
    const relevant = filterByProcessNames(snapshot, this.processNames);
    const processes = relevant.filter((process) => this.canHandle(process));
    if (processes.length === 0) return [];

    const db = this.locator.openDb();
    if (!db) return processes.map((process) => this.mapper.mapProcessOnlyAgent(process));

    const agents: AgentInfo[] = [];
    for (const proc of processes) {
      if (!proc.cwd) {
        agents.push(this.mapper.mapProcessOnlyAgent(proc));
        continue;
      }

      const session = this.locator.findSessionForDirectory(db, proc.cwd);
      if (!session) {
        agents.push(this.mapper.mapProcessOnlyAgent(proc));
        continue;
      }

      const stats = this.parser.getSessionStats(db, session.sessionId);
      agents.push(this.mapper.mapSessionToAgent(session, stats, proc));
    }

    return agents;
  }

  getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
    const ref = decodeSessionRef(sessionFilePath);
    if (!ref) return [];

    const db = this.locator.openDb();
    if (!db) return [];

    return this.parser.getConversation(db, ref.sessionId, options);
  }

  async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
    return this.locator.listSessions(opts);
  }

  async findSessionsById(sessionId: string): Promise<SessionSummary[]> {
    return this.locator.findSessionsById(sessionId);
  }
}
