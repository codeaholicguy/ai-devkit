/**
 * Devin Adapter
 *
 * Detects running Devin CLI agents by:
 * 1. Filtering `devin` processes from a shared process snapshot, rejecting
 *    utility subcommands (list, doctor, ssh, ...) and `devin acp` children
 *    spawned by a Devin TUI
 * 2. Matching processes to sessions via `session_locks/<slug>.lock` files,
 *    which contain the PID of the session's `devin acp` backend (lock-first;
 *    a TUI is matched through its backend child's ppid)
 * 3. Falling back to `sessions.working_directory` matching in
 *    ~/.local/share/devin/cli/sessions.db (WAL SQLite, opened read-only)
 *
 * sessionFilePath encodes "<dbPath>::<sessionSlug>" so getConversation() can
 * address a session row without extending the AgentAdapter interface.
 */

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
import { DevinAgentMapper } from "./DevinAgentMapper.js";
import { DevinSessionLocator, decodeDevinSessionRef } from "./DevinSessionLocator.js";
import { DevinSessionParser } from "./DevinSessionParser.js";
import { findHarnessProcesses, matchesExecutable } from "../shared.js";
import { executablePath } from "../../utils/process.js";

/**
 * `devin` invocations that are utilities, not agent sessions. `acp` is
 * deliberately absent: a standalone `devin acp` serves an external client
 * and is itself an agent.
 */
const UTILITY_SUBCOMMANDS = new Set([
  "auth",
  "cloud",
  "desktop",
  "doctor",
  "forward",
  "help",
  "list",
  "ls",
  "mcp",
  "migrate",
  "models",
  "plugins",
  "rm",
  "rules",
  "sandbox",
  "setup",
  "skills",
  "ssh",
  "uninstall",
  "update",
  "version",
]);

/**
 * Flags that always consume the next argv token as their value.
 * (`devin --help`, main-command options.)
 */
const REQUIRED_VALUE_FLAGS = new Set([
  "--prompt-file",
  "--config",
  "--permission-mode",
  "--model",
]);

/**
 * Flags whose value is optional: the next token is consumed only when it
 * isn't itself a flag (commander `[<VALUE>]` semantics).
 */
const OPTIONAL_VALUE_FLAGS = new Set([
  "-p",
  "--print",
  "-r",
  "--resume",
  "--export",
  "--respect-workspace-trust",
]);

/**
 * First positional argv token after argv[0] — the subcommand candidate.
 * Flag values are skipped (so `devin -p "update deps"` isn't mistaken for
 * the `update` subcommand); `--` ends the search.
 */
function firstPositionalToken(command: string): string | null {
  const argv0 = executablePath(command);
  const tokens = command
    .trim()
    .slice(argv0.length)
    .trim()
    .split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    if (token === "--") return null;
    if (!token.startsWith("-")) return token;
    const flag = token.split("=", 1)[0];
    if (flag === token) {
      if (REQUIRED_VALUE_FLAGS.has(flag)) {
        i++;
      } else if (OPTIONAL_VALUE_FLAGS.has(flag) && !tokens[i + 1]?.startsWith("-")) {
        i++;
      }
    }
  }
  return null;
}

export class DevinAdapter implements AgentAdapter {
  readonly type = "devin" as const;
  readonly processNames = ["devin"] as const;

  private readonly parser: DevinSessionParser;
  private readonly locator: DevinSessionLocator;
  private readonly mapper: DevinAgentMapper;
  private readonly cleanup = (): void => this.close();

  constructor(dbPath?: string, locksDir?: string) {
    this.parser = new DevinSessionParser();
    // Locator defaults resolve dbPath itself and derive locksDir from it.
    this.locator = new DevinSessionLocator(dbPath, locksDir, this.parser);
    this.mapper = new DevinAgentMapper(this.locator.dbFilePath);
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
    if (!matchesExecutable(processInfo.command, "devin")) return false;
    const subcommand = firstPositionalToken(processInfo.command);
    return subcommand === null || !UTILITY_SUBCOMMANDS.has(subcommand.toLowerCase());
  }

  async detectAgents(context?: AgentDetectionContext): Promise<AgentInfo[]> {
    const { processes } = await findHarnessProcesses(this, context);
    if (processes.length === 0) return [];

    const db = this.locator.openDb();
    const processByPid = new Map(processes.map((proc) => [proc.pid, proc]));

    // Locks map a session to its holder PID (the `devin acp` backend); a TUI
    // is matched through its backend child's ppid. Only trust locks whose
    // holder is a live devin process in this snapshot (stale files and PID
    // reuse are filtered out).
    const sessionByPid = new Map<number, string>();
    for (const lock of this.locator.listActiveLocks()) {
      const holder = processByPid.get(lock.pid);
      if (!holder || !this.canHandle(holder)) continue;
      sessionByPid.set(lock.pid, lock.sessionId);
      if (holder.ppid !== undefined) sessionByPid.set(holder.ppid, lock.sessionId);
    }

    const agents: AgentInfo[] = [];

    for (const proc of processes) {
      if (this.isAcpBackendChild(proc, processByPid)) continue;

      const slug = sessionByPid.get(proc.pid);
      const session = !db
        ? null
        : slug
          ? this.locator.findSessionById(db, slug)
          : proc.cwd
            ? this.locator.findSessionForDirectory(db, proc.cwd)
            : null;

      if (!session || !db) {
        agents.push(this.mapper.mapProcessOnlyAgent(proc));
        continue;
      }

      const stats = this.parser.getSessionStats(db, session.sessionId);
      agents.push(this.mapper.mapSessionToAgent(session, stats, proc));
    }

    return agents;
  }

  getConversation(sessionFilePath: string, options?: ConversationOptions): ConversationMessage[] {
    const sessionId = decodeDevinSessionRef(sessionFilePath);
    if (!sessionId) return [];

    const db = this.locator.openDb();
    if (!db) return [];

    return this.parser.getConversation(db, sessionId, options);
  }

  async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
    return this.locator.listSessions(opts);
  }

  async findSessionsById(sessionId: string): Promise<SessionSummary[]> {
    return this.locator.findSessionsById(sessionId);
  }

  /**
   * A `devin acp` process spawned by another devin process is that session's
   * backend, not a separate agent. Standalone `acp` processes (external ACP
   * clients) keep their own agent entry.
   */
  private isAcpBackendChild(
    proc: ProcessInfo,
    processByPid: Map<number, ProcessInfo>,
  ): boolean {
    if (firstPositionalToken(proc.command)?.toLowerCase() !== "acp") return false;
    if (proc.ppid === undefined) return false;
    return processByPid.has(proc.ppid);
  }
}
