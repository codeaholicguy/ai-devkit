/**
 * Copilot Adapter
 *
 * Detects running GitHub Copilot CLI agents by:
 * 1. Filtering Copilot processes from a shared asynchronous process snapshot
 * 2. Using snapshot CWD and start-time enrichment
 * 3. Mapping active ~/.copilot/session-state/{sessionId}/inuse.{pid}.lock files to processes
 * 4. Reading events.jsonl as the primary session/conversation source
 * 5. Reading workspace.yaml as a flat fallback metadata source
 */

import * as path from "path";
import type {
  AgentAdapter,
  AgentInfo,
  ConversationMessage,
  ListSessionsOptions,
  ProcessInfo,
  SessionSummary,
  AgentDetectionContext,
} from "../../adapters/AgentAdapter.js";
import {
  captureProcessSnapshot,
  executableBasename,
  filterByProcessNames,
  findWrapperProcess,
  findWrapperProcessPids,
} from "../../utils/process.js";
import { AgentRegistry, type RegistryEntry } from "../../utils/AgentRegistry.js";
import { CopilotAgentMapper } from "./CopilotAgentMapper.js";
import { CopilotSessionLocator } from "./CopilotSessionLocator.js";
import { CopilotSessionParser } from "./CopilotSessionParser.js";

export interface CopilotAdapterOptions {
  sessionStateDir?: string;
}

export class CopilotAdapter implements AgentAdapter {
  readonly type = "copilot" as const;
  readonly processNames = ["copilot"] as const;

  private readonly registry: AgentRegistry;
  private readonly parser: CopilotSessionParser;
  private readonly mapper: CopilotAgentMapper;
  private readonly locator: CopilotSessionLocator;

  constructor(
    registry: AgentRegistry = AgentRegistry.default(),
    options: CopilotAdapterOptions = {},
  ) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    this.registry = registry;
    this.parser = new CopilotSessionParser();
    this.mapper = new CopilotAgentMapper(this.parser);
    this.locator = new CopilotSessionLocator({
      sessionStateDir: options.sessionStateDir ?? path.join(homeDir, ".copilot", "session-state"),
    });
  }

  canHandle(processInfo: ProcessInfo): boolean {
    return this.isCopilotExecutable(processInfo.command);
  }

  async detectAgents(context?: AgentDetectionContext): Promise<AgentInfo[]> {
    const snapshot = context?.processes ?? (await captureProcessSnapshot(this.processNames));
    const relevant = filterByProcessNames(snapshot, this.processNames);
    const processes = relevant.filter((process) => this.canHandle(process));
    if (processes.length === 0) return [];

    const processByPid = new Map(processes.map((proc) => [proc.pid, proc]));
    const registryEntriesByPid = new Map(this.registry.list().map((entry) => [entry.pid, entry]));
    const matchedPids = new Set<number>();
    const matchedProcesses: ProcessInfo[] = [];
    const agents: AgentInfo[] = [];

    for (const lock of this.locator.discoverActiveLocks()) {
      const proc = processByPid.get(lock.pid);
      if (!proc) continue;

      const session = this.parser.readSessionDir(lock.sessionDir, lock.sessionId);
      if (!session) continue;

      const agent = this.mapper.mapSessionToAgent(session, proc);
      this.applyWrapperRegistryName(agent, proc, processes, registryEntriesByPid);
      agents.push(agent);
      matchedPids.add(proc.pid);
      matchedProcesses.push(proc);
    }

    const wrapperPids = findWrapperProcessPids(processes, matchedProcesses);
    for (const proc of processes) {
      if (!matchedPids.has(proc.pid) && !wrapperPids.has(proc.pid)) {
        const agent = this.mapper.mapProcessOnlyAgent(proc);
        this.applyWrapperRegistryName(agent, proc, processes, registryEntriesByPid);
        agents.push(agent);
      }
    }

    return agents;
  }

  getConversation(sessionFilePath: string, options?: { verbose?: boolean }): ConversationMessage[] {
    return this.parser.getConversation(sessionFilePath, options);
  }

  async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];

    for (const { sessionDir, sessionId } of this.locator.listSessionDirs()) {
      const session = this.parser.readSessionDir(sessionDir, sessionId);
      if (!session) continue;
      if (opts?.cwd !== undefined && session.projectPath !== opts.cwd) continue;

      summaries.push({
        type: this.type,
        sessionId: session.sessionId,
        cwd: session.projectPath,
        firstUserMessage: session.firstUserMessage,
        lastActive: session.lastActive,
        startedAt: session.sessionStart,
        sessionFilePath: session.eventsFilePath,
      });
    }

    return summaries;
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

  private isCopilotExecutable(command: string): boolean {
    const base = executableBasename(command);
    return base === "copilot" || base === "copilot.exe";
  }
}
