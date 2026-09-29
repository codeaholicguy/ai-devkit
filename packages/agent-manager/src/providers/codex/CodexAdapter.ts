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
import {
  captureProcessSnapshot,
  executableBasename,
  filterByProcessNames,
} from "../../utils/process.js";
import { AgentRegistry } from "../../utils/AgentRegistry.js";
import { CodexAgentMapper } from "./CodexAgentMapper.js";
import { CodexSessionLocator, type CodexDirectMatch } from "./CodexSessionLocator.js";
import { CodexSessionMapping } from "./CodexSessionMapping.js";
import { CodexSessionParser } from "./CodexSessionParser.js";

/**
 * Codex subcommands that never own a local agent session: long-running helpers
 * (app-server, sandbox, MCP/exec servers) and short-lived management commands.
 * Interactive `codex`, `resume`, `fork`, `exec` and `review` remain detected.
 */
const CODEX_HELPER_SUBCOMMANDS = new Set([
  "agents",
  "app",
  "app-server",
  "apply",
  "a",
  "archive",
  "cloud",
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
  "-i",
  "--image",
  "--add-dir",
  "--enable",
  "--disable",
  "--local-provider",
]);

const CODEX_APP_SERVER_DAEMON_DIR = "app-server-daemon";

function isCodexHelperCommand(command: string): boolean {
  const [executable = "", ...args] = command.trim().split(/\s+/);
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
    if (!arg.includes("=") && CODEX_VALUE_FLAGS.has(arg)) index++;
  }
  return undefined;
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

  constructor(registry: AgentRegistry = AgentRegistry.default()) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    this.registry = registry;
    this.parser = new CodexSessionParser();
    this.mapper = new CodexAgentMapper(this.parser);
    this.codexSessionsDir = path.join(homeDir, ".codex", "sessions");
    this.sessionMappingPath = path.join(homeDir, ".codex", "ai-devkit", "sessions.json");
  }

  canHandle(processInfo: ProcessInfo): boolean {
    const base = executableBasename(processInfo.command);
    if (base !== "codex" && base !== "codex.exe") return false;
    return !isCodexHelperCommand(processInfo.command);
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
    const snapshot = context?.processes ?? (await captureProcessSnapshot(this.processNames));
    const relevant = filterByProcessNames(snapshot, this.processNames);
    return relevant.filter((processInfo) => this.canHandle(processInfo));
  }

  private createLocator(): CodexSessionLocator {
    return new CodexSessionLocator({ sessionsDir: this.codexSessionsDir }, this.parser);
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
