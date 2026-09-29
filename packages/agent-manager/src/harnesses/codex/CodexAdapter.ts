import * as fs from "fs";
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
import { AgentRegistry } from "../../utils/AgentRegistry.js";
import { CodexAgentMapper } from "./CodexAgentMapper.js";
import { CodexSessionLocator, type CodexDirectMatch } from "./CodexSessionLocator.js";
import { CodexSessionMapping } from "./CodexSessionMapping.js";
import { CodexSessionParser } from "./CodexSessionParser.js";
import { findHarnessProcesses, homeDir, matchesExecutable } from "../shared.js";

/**
 * Codex subcommands that never own a local agent session: long-running helpers
 * (app-server, sandbox, MCP/exec servers) and short-lived management commands.
 * Interactive `codex`, `resume`, `fork`, `exec` and `review` remain detected.
 *
 * Classification of `review`, `cloud` and `agents` checked against Codex CLI
 * 0.157.1 (source tag rust-v0.157.1, codex-rs/cli/src/main.rs):
 * - `review` is detected: it runs as `codex exec review`, starting a
 *   non-ephemeral thread in-process (source `exec`, originator `codex_exec`), so
 *   it writes a `session_meta` rollout under ~/.codex/sessions like `codex exec`.
 * - `cloud` is excluded: it browses and applies Codex Cloud tasks over HTTP and
 *   never starts a local thread or rollout.
 * - `agents` is excluded: it opens a dashboard over every session on the shared
 *   app-server daemon without starting a thread of its own; the daemon, not
 *   this process, owns and writes those sessions' rollouts.
 */
const CODEX_HELPER_SUBCOMMANDS = new Set([
  "agents",
  "app",
  "app-server",
  "apply",
  "a",
  "archive",
  "cloud",
  "cloud-tasks",
  "completion",
  "debug",
  "delete",
  "doctor",
  "exec-server",
  "features",
  "help",
  "login",
  "logout",
  "mcp",
  "mcp-server",
  "migrate-rollouts",
  "plugin",
  "queue",
  "remote-control",
  "responses-api-proxy",
  "sandbox",
  "stdio-to-uds",
  "unarchive",
  "update",
]);

/**
 * Known root Codex subcommand names and aliases, including the hidden ones in
 * Codex CLI 0.157.1. A variadic flag's values stop at these, as clap stops there.
 */
const CODEX_SUBCOMMANDS = new Set([
  ...CODEX_HELPER_SUBCOMMANDS,
  "e",
  "exec",
  "execpolicy",
  "fork",
  "resume",
  "review",
  "tcp-tunnel",
]);

/** Global Codex flags that consume the following argument as their value. */
const CODEX_VALUE_FLAGS = new Set([
  "-c",
  "--config",
  "-m",
  "--model",
  "-p",
  "--profile",
  "-s",
  "--sandbox",
  "-a",
  "--ask-for-approval",
  "-C",
  "--cd",
  "--add-dir",
  "--enable",
  "--disable",
  "--local-provider",
  "--remote",
  "--remote-auth-token-env",
]);

/**
 * Global Codex flags that take one or more values (clap `num_args = 1..`).
 * `-i, --image <FILE>...` is the only one in Codex CLI 0.157.1.
 */
const CODEX_VARIADIC_VALUE_FLAGS = new Set(["-i", "--image"]);

const CODEX_APP_SERVER_DAEMON_DIR = "app-server-daemon";

function isCodexHelperCommand(command: string): boolean {
  const trimmed = command.trim();
  // Resolve argv[0] first so an install path containing spaces is not read as arguments.
  const executable = executablePath(trimmed);
  const args = trimmed.slice(executable.length).trim().split(/\s+/).filter(Boolean);
  if (executable.replace(/\\/g, "/").split("/").includes(CODEX_APP_SERVER_DAEMON_DIR)) {
    return true;
  }

  const subcommand = firstPositionalArgument(args);
  return subcommand !== undefined && CODEX_HELPER_SUBCOMMANDS.has(subcommand);
}

function firstPositionalArgument(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--") return undefined;
    if (!arg.startsWith("-")) return arg;
    if (arg.includes("=")) continue;
    if (CODEX_VALUE_FLAGS.has(arg)) {
      index++;
    } else if (CODEX_VARIADIC_VALUE_FLAGS.has(arg)) {
      // Like clap, take values until the next flag or subcommand name.
      while (index + 1 < args.length && isVariadicFlagValue(args[index + 1])) index++;
    }
  }
  return undefined;
}

function isVariadicFlagValue(arg: string): boolean {
  return !arg.startsWith("-") && !CODEX_SUBCOMMANDS.has(arg);
}

interface MappedAgentResult {
  agents: AgentInfo[];
  fallback: ProcessInfo[];
}

export class CodexAdapter implements AgentAdapter {
  readonly type = "codex" as const;
  readonly processNames = ["codex"] as const;

  private readonly registry: AgentRegistry;
  private readonly parser: CodexSessionParser;
  private readonly mapper: CodexAgentMapper;
  private readonly codexSessionsDir: string;
  private readonly sessionMappingPath: string;
  private locator?: CodexSessionLocator;

  constructor(registry: AgentRegistry = AgentRegistry.default()) {
    this.registry = registry;
    this.parser = new CodexSessionParser();
    this.mapper = new CodexAgentMapper(this.parser);
    this.codexSessionsDir = path.join(homeDir(), ".codex", "sessions");
    this.sessionMappingPath = path.join(homeDir(), ".codex", "ai-devkit", "sessions.json");
  }

  canHandle(processInfo: ProcessInfo): boolean {
    return (
      matchesExecutable(processInfo.command, "codex") && !isCodexHelperCommand(processInfo.command)
    );
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
    const processes = await this.getCodexProcesses(context);
    if (processes.length === 0) return [];

    const mappingResult = this.mapSessionMappingMatches(processes);
    const cacheResult = this.mapRegistryCache(mappingResult.fallback);
    const locatorResult = this.createLocator().matchRunningProcesses(cacheResult.fallback);

    const directResult = this.mapDirectMatches(locatorResult.direct);
    const legacyResult = this.mapLegacyMatches(locatorResult.legacyMatches);
    const unmatchedProcesses = this.findUnmatchedProcesses(locatorResult.fallback, [
      ...directResult.agents,
      ...legacyResult.agents,
    ]);

    return [
      ...mappingResult.agents,
      ...cacheResult.agents,
      ...directResult.agents,
      ...legacyResult.agents,
      ...directResult.fallback.map((processInfo) => this.mapper.mapProcessOnlyAgent(processInfo)),
      ...unmatchedProcesses.map((processInfo) => this.mapper.mapProcessOnlyAgent(processInfo)),
    ];
  }

  getConversation(sessionFilePath: string, options?: ConversationOptions): ConversationMessage[] {
    return this.parser.getConversation(sessionFilePath, options);
  }

  async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];

    for (const filePath of this.createLocator().discoverHistoricalSessionFiles()) {
      const summary = this.parser.fileToSessionSummary(filePath);
      if (!summary) continue;
      if (opts?.cwd !== undefined && summary.cwd !== opts.cwd) continue;
      summaries.push(summary);
    }

    return summaries;
  }

  async findSessionsById(sessionId: string): Promise<SessionSummary[]> {
    const sessionFile = this.createLocator().findSessionFileById(sessionId);
    if (!sessionFile) return [];

    const summary = this.parser.fileToSessionSummary(sessionFile.filePath);
    return summary?.sessionId === sessionId ? [summary] : [];
  }

  private async getCodexProcesses(context?: AgentDetectionContext): Promise<ProcessInfo[]> {
    return (await findHarnessProcesses(this, context)).processes;
  }

  /** Reused across refreshes so the locator's session_meta and negative caches persist. */
  private createLocator(): CodexSessionLocator {
    this.locator ??= new CodexSessionLocator({ sessionsDir: this.codexSessionsDir }, this.parser);
    return this.locator;
  }

  private createSessionMapping(): CodexSessionMapping {
    return new CodexSessionMapping({
      mappingPath: this.sessionMappingPath,
      sessionsDir: this.codexSessionsDir,
    });
  }

  private mapSessionMappingMatches(processes: ProcessInfo[]): MappedAgentResult {
    const { matches, fallback } = this.createSessionMapping().match(processes);
    const agents: AgentInfo[] = [];

    for (const match of matches) {
      const session = this.parser.readSessionIncremental(match.filePath);
      if (session) {
        agents.push(this.mapper.mapSessionToAgent(session, match.process, match.filePath));
      } else {
        fallback.push(match.process);
      }
    }

    return { agents, fallback };
  }

  private mapRegistryCache(processes: ProcessInfo[]): MappedAgentResult {
    const agents: AgentInfo[] = [];
    const fallback: ProcessInfo[] = [];
    const byPid = new Map(this.registry.list().map((entry) => [entry.pid, entry]));

    for (const processInfo of processes) {
      const entry = byPid.get(processInfo.pid);
      if (
        !entry ||
        entry.type !== this.type ||
        !entry.sessionFilePath ||
        !fs.existsSync(entry.sessionFilePath)
      ) {
        fallback.push(processInfo);
        continue;
      }

      const session = this.parser.readSessionIncremental(entry.sessionFilePath);
      if (!session) {
        fallback.push(processInfo);
        continue;
      }

      agents.push(this.mapper.mapSessionToAgent(session, processInfo, entry.sessionFilePath));
    }

    return { agents, fallback };
  }

  private mapDirectMatches(matches: CodexDirectMatch[]): MappedAgentResult {
    const agents: AgentInfo[] = [];
    const fallback: ProcessInfo[] = [];

    for (const match of matches) {
      const session = this.parser.readSessionIncremental(match.sessionFile.filePath);
      if (session) {
        agents.push(
          this.mapper.mapSessionToAgent(session, match.process, match.sessionFile.filePath),
        );
      } else {
        fallback.push(match.process);
      }
    }

    return { agents, fallback };
  }

  private mapLegacyMatches(
    matches: Array<{ process: ProcessInfo; session: { filePath: string } }>,
  ): MappedAgentResult {
    const agents: AgentInfo[] = [];
    const fallback: ProcessInfo[] = [];

    for (const match of matches) {
      const session = this.parser.readSessionIncremental(match.session.filePath);
      if (session) {
        agents.push(this.mapper.mapSessionToAgent(session, match.process, match.session.filePath));
      } else {
        fallback.push(match.process);
      }
    }

    return { agents, fallback };
  }

  private findUnmatchedProcesses(processes: ProcessInfo[], agents: AgentInfo[]): ProcessInfo[] {
    const matchedPids = new Set(agents.map((agent) => agent.pid));
    return processes.filter((processInfo) => !matchedPids.has(processInfo.pid));
  }
}
