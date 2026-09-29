/**
 * Copilot Adapter
 *
 * Detects running GitHub Copilot CLI agents by:
 * 1. Filtering Copilot processes from a shared asynchronous process snapshot
 * 2. Using snapshot CWD and start-time enrichment
 * 3. Mapping active ~/.copilot/session-state/{sessionId}/inuse.{pid}.lock files to processes
 *    (only directories modified since the process started are listed, and a
 *    known lock is re-validated with one stat on later refreshes)
 * 4. Reading events.jsonl as the primary session/conversation source (incrementally
 *    cached across refreshes, so unchanged files are not re-read)
 * 5. Reading workspace.yaml as a flat fallback metadata source
 */

import * as path from "path";
import type {
  AgentAdapter,
  AgentInfo,
  ConversationMessage,
  ConversationOptions,
  ListSessionsOptions,
  ProcessInfo,
  SessionSummary,
  AgentDetectionContext,
} from "../../adapters/AgentAdapter.js";
import { findWrapperProcess, findWrapperProcessPids } from "../../utils/process.js";
import { AgentRegistry, type RegistryEntry } from "../../utils/AgentRegistry.js";
import { CopilotAgentMapper } from "./CopilotAgentMapper.js";
import { CopilotSessionLocator } from "./CopilotSessionLocator.js";
import { CopilotSessionParser, type CopilotSession } from "./CopilotSessionParser.js";
import { findHarnessProcesses, homeDir, matchesExecutable } from "../shared.js";

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
    this.registry = registry;
    this.parser = new CopilotSessionParser();
    this.mapper = new CopilotAgentMapper(this.parser);
    this.locator = new CopilotSessionLocator({
      sessionStateDir: options.sessionStateDir ?? path.join(homeDir(), ".copilot", "session-state"),
    });
  }

  canHandle(processInfo: ProcessInfo): boolean {
    return matchesExecutable(processInfo.command, "copilot");
  }

  async detectAgents(context?: AgentDetectionContext): Promise<AgentInfo[]> {
    try {
      return await this.detectRunningAgents(context);
    } finally {
      // Drop cached event summaries for sessions that were not part of this refresh
      this.parser.pruneSessionCache();
    }
  }

  private async detectRunningAgents(context?: AgentDetectionContext): Promise<AgentInfo[]> {
    const { processes } = await findHarnessProcesses(this, context);
    if (processes.length === 0) return [];

    const processByPid = new Map(processes.map((proc) => [proc.pid, proc]));
    const registryEntriesByPid = new Map(this.registry.list().map((entry) => [entry.pid, entry]));
    const matchedPids = new Set<number>();
    const matchedProcesses: ProcessInfo[] = [];
    const agents: AgentInfo[] = [];

    for (const lock of this.locator.discoverActiveLocks(processes)) {
      const proc = processByPid.get(lock.pid);
      if (!proc) continue;

      const session = this.parser.readSessionDirIncremental(lock.sessionDir, lock.sessionId);
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

  getConversation(sessionFilePath: string, options?: ConversationOptions): ConversationMessage[] {
    return this.parser.getConversation(sessionFilePath, options);
  }

  async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];

    for (const { sessionDir, sessionId } of this.locator.listSessionDirs()) {
      const session = this.parser.readSessionDir(sessionDir, sessionId);
      if (!session) continue;
      if (opts?.cwd !== undefined && session.projectPath !== opts.cwd) continue;

      summaries.push(this.toSessionSummary(session));
    }

    return summaries;
  }

  async findSessionsById(sessionId: string): Promise<SessionSummary[]> {
    const match = this.locator.findSessionDirById(sessionId);
    if (match) {
      const session = this.parser.readSessionDir(match.sessionDir, match.sessionId);
      if (session?.sessionId === sessionId) {
        return [this.toSessionSummary(session)];
      }
    }

    return (await this.listSessions()).filter((session) => session.sessionId === sessionId);
  }

  private toSessionSummary(session: CopilotSession): SessionSummary {
    return {
      type: this.type,
      sessionId: session.sessionId,
      cwd: session.projectPath,
      firstUserMessage: session.firstUserMessage,
      lastActive: session.lastActive,
      startedAt: session.sessionStart,
      sessionFilePath: session.eventsFilePath,
    };
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
}
