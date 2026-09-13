/**
 * Gemini CLI Adapter
 *
 * Detects running Gemini CLI agents by:
 * 1. Filtering Gemini Node processes from a shared asynchronous process snapshot
 * 2. Using snapshot CWD and start-time enrichment
 * 3. Discovering session files from ~/.gemini/tmp/<shortId>/chats/session-*.json
 * 4. Matching sessions to processes via shared matchProcessesToSessions()
 *    using sha256(cwd) === session.projectHash as the resolvedCwd source
 * 5. Extracting summary from the most recent user message in the session JSON
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
  findWrapperProcess,
  findWrapperProcessPids,
} from "../../utils/process.js";
import { matchProcessesToSessions } from "../../utils/matching.js";
import { AgentRegistry, type RegistryEntry } from "../../utils/AgentRegistry.js";
import { GeminiAgentMapper } from "./GeminiAgentMapper.js";
import { GeminiSessionLocator, type GeminiSessionDiscovery } from "./GeminiSessionLocator.js";
import { GeminiSessionParser } from "./GeminiSessionParser.js";

export interface GeminiCliAdapterOptions {
  geminiTmpDir?: string;
}

export class GeminiCliAdapter implements AgentAdapter {
  readonly type = "gemini_cli" as const;
  readonly processNames = ["node"] as const;

  private readonly registry: AgentRegistry;
  private readonly parser: GeminiSessionParser;
  private readonly mapper: GeminiAgentMapper;
  private readonly locator: GeminiSessionLocator;

  constructor(
    registry: AgentRegistry = AgentRegistry.default(),
    options: GeminiCliAdapterOptions = {},
  ) {
    this.registry = registry;
    this.parser = new GeminiSessionParser();
    this.mapper = new GeminiAgentMapper(this.parser);
    this.locator = new GeminiSessionLocator(options);
  }

  canHandle(processInfo: ProcessInfo): boolean {
    return this.isGeminiExecutable(processInfo.command);
  }

  /**
   * Detect running Gemini CLI agents.
   *
   * Gemini CLI ships as a Node script (`bundle/gemini.js` with shebang
   * `#!/usr/bin/env node`) — unlike Claude Code (native binary per
   * platform) or Codex CLI (Node wrapper that execs a native Rust
   * binary). The primary running process is therefore the Node runtime
   * itself, and `ps aux` lists it as `node /path/to/gemini ...` with
   * argv[0] = `node`. We scan the Node process pool via the shared
   * snapshot and keep only those whose command line references the gemini
   * executable or script via isGeminiExecutable().
   */
  async detectAgents(context?: AgentDetectionContext): Promise<AgentInfo[]> {
    const processes = await this.getGeminiProcesses(context);
    if (processes.length === 0) return [];

    const wrapperPids = findWrapperProcessPids(processes);
    const { cachedAgents, remaining } = this.tryRegistryCache(processes, wrapperPids);
    if (remaining.length === 0) return this.deduplicateSessionAgents(cachedAgents);

    const candidateProcesses = remaining.filter((proc) => !wrapperPids.has(proc.pid));
    const registryEntriesByPid = new Map(this.registry.list().map((entry) => [entry.pid, entry]));
    const discovery = this.locator.discoverSessions(candidateProcesses);

    const agents =
      discovery.sessions.length === 0
        ? this.mapProcessOnlyAgents(candidateProcesses, processes, registryEntriesByPid)
        : this.mapSessionDiscovery(discovery, candidateProcesses, processes, registryEntriesByPid);

    return this.deduplicateSessionAgents([...cachedAgents, ...agents]);
  }

  getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
    return this.parser.getConversation(sessionFilePath, options);
  }

  async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];

    for (const filePath of this.locator.discoverHistoricalSessionFiles()) {
      const summary = this.parser.fileToSessionSummary(filePath);
      if (!summary) continue;
      if (opts?.cwd !== undefined && summary.cwd !== opts.cwd) continue;
      summaries.push(summary);
    }

    return summaries;
  }

  private async getGeminiProcesses(context?: AgentDetectionContext): Promise<ProcessInfo[]> {
    const snapshot = context?.processes ?? (await captureProcessSnapshot(this.processNames));
    const relevant = filterByProcessNames(snapshot, this.processNames);
    return relevant.filter((process) => this.canHandle(process));
  }

  private mapSessionDiscovery(
    discovery: GeminiSessionDiscovery,
    candidateProcesses: ProcessInfo[],
    allProcesses: ProcessInfo[],
    registryEntriesByPid: Map<number, RegistryEntry>,
  ): AgentInfo[] {
    const matches = matchProcessesToSessions(candidateProcesses, discovery.sessions);
    const matchedPids = new Set(matches.map((m) => m.process.pid));
    const matchedProcesses: ProcessInfo[] = [];
    const agents: AgentInfo[] = [];

    for (const match of matches) {
      const cachedContent = discovery.contentCache.get(match.session.filePath);
      const sessionData = this.parser.parseSession(cachedContent, match.session.filePath);
      if (!sessionData) {
        matchedPids.delete(match.process.pid);
        continue;
      }

      const agent = this.mapper.mapSessionToAgent(
        sessionData,
        match.process,
        match.session.filePath,
      );
      this.applyWrapperRegistryName(agent, match.process, allProcesses, registryEntriesByPid);
      agents.push(agent);
      matchedProcesses.push(match.process);
    }

    const matchedWrapperPids = findWrapperProcessPids(candidateProcesses, matchedProcesses);
    const unmatchedProcesses = candidateProcesses.filter(
      (process) => !matchedPids.has(process.pid) && !matchedWrapperPids.has(process.pid),
    );

    agents.push(
      ...this.mapProcessOnlyAgents(unmatchedProcesses, allProcesses, registryEntriesByPid),
    );
    return agents;
  }

  private mapProcessOnlyAgents(
    processes: ProcessInfo[],
    allProcesses: ProcessInfo[],
    registryEntriesByPid: Map<number, RegistryEntry>,
  ): AgentInfo[] {
    return processes.map((processInfo) => {
      const agent = this.mapper.mapProcessOnlyAgent(processInfo);
      this.applyWrapperRegistryName(agent, processInfo, allProcesses, registryEntriesByPid);
      return agent;
    });
  }

  private applyWrapperRegistryName(
    agent: AgentInfo,
    processInfo: ProcessInfo,
    processes: ProcessInfo[],
    registryEntriesByPid: Map<number, RegistryEntry>,
  ): void {
    const wrapper = findWrapperProcess(processes, processInfo);
    const wrapperEntry = wrapper ? registryEntriesByPid.get(wrapper.pid) : undefined;
    if (wrapperEntry?.type === this.type) {
      agent.name = wrapperEntry.name;
    }
  }

  private deduplicateSessionAgents(agents: AgentInfo[]): AgentInfo[] {
    const bySession = new Map<string, AgentInfo>();
    const result: AgentInfo[] = [];

    for (const agent of agents) {
      const sessionKey = this.sessionDeduplicationKey(agent);
      if (!sessionKey) {
        result.push(agent);
        continue;
      }

      const existing = bySession.get(sessionKey);
      if (!existing) {
        bySession.set(sessionKey, agent);
        result.push(agent);
        continue;
      }

      if (agent.pid > existing.pid) {
        bySession.set(sessionKey, agent);
        const index = result.indexOf(existing);
        if (index >= 0) result[index] = agent;
      }
    }

    return result;
  }

  private sessionDeduplicationKey(agent: AgentInfo): string | null {
    if (agent.sessionFilePath) return `file:${agent.sessionFilePath}`;
    if (agent.sessionId && !agent.sessionId.startsWith("pid-")) {
      return `session:${agent.sessionId}`;
    }
    return null;
  }

  private tryRegistryCache(
    processes: ProcessInfo[],
    wrapperPids: Set<number>,
  ): {
    cachedAgents: AgentInfo[];
    remaining: ProcessInfo[];
  } {
    const cachedAgents: AgentInfo[] = [];
    const remaining: ProcessInfo[] = [];
    const byPid = new Map(this.registry.list().map((e) => [e.pid, e]));

    for (const proc of processes) {
      const entry = byPid.get(proc.pid);
      if (
        wrapperPids.has(proc.pid) ||
        !entry ||
        entry.type !== this.type ||
        !entry.sessionFilePath
      ) {
        remaining.push(proc);
        continue;
      }

      const sessionData = this.parser.parseSession(undefined, entry.sessionFilePath);
      if (!sessionData) {
        remaining.push(proc);
        continue;
      }

      cachedAgents.push(this.mapper.mapSessionToAgent(sessionData, proc, entry.sessionFilePath));
    }

    return { cachedAgents, remaining };
  }

  private isGeminiExecutable(command: string): boolean {
    // Accept any token in the command line whose basename matches a
    // known gemini entrypoint. This is intentionally broader than the
    // other adapters' argv[0]-only check because the Node-script
    // distribution puts the real gemini path in argv[1..], not argv[0].
    for (const token of command.trim().split(/\s+/)) {
      const base = executableBasename(token);
      if (base === "gemini" || base === "gemini.exe" || base === "gemini.js") {
        return true;
      }
    }
    return false;
  }
}
