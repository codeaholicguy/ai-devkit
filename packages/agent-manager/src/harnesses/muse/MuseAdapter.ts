import * as path from "path";
import type {
  AgentAdapter,
  AgentDetectionContext,
  AgentInfo,
  ConversationMessage,
  ConversationOptions,
  ListSessionsOptions,
  ProcessInfo,
  SessionSummary,
} from "../../adapters/AgentAdapter.js";
import { safeStat } from "../../utils/session.js";
import { MuseAgentMapper } from "./MuseAgentMapper.js";
import { MuseSessionLocator } from "./MuseSessionLocator.js";
import { MuseSessionParser } from "./MuseSessionParser.js";
import { findHarnessProcesses, homeDir } from "../shared.js";

export interface MuseAdapterOptions {
  homeDir?: string;
}

/**
 * Muse (Meta Muse Code) adapter.
 *
 * Detection joins two sources:
 * 1. Live runtime entries (`~/.local/share/muse/runtime/muse/sessions/<id>.json`)
 *    matched to processes by `process_generation_hint: "pid=<n>"`.
 * 2. The dated transcript archive (`sessions/yyyy/mm/dd/<uuid>/session.jsonl`).
 *
 * The launcher binary is versioned (`muse-bin-<version>-<build>`), so discovery
 * uses `processNamePrefixes`; `canHandle` keeps the precise shape check.
 */
export class MuseAdapter implements AgentAdapter {
  readonly type = "muse" as const;
  readonly processNames = ["muse"] as const;
  readonly processNamePrefixes = ["muse"] as const;

  private readonly home: string;
  private readonly parser: MuseSessionParser;
  private readonly mapper: MuseAgentMapper;

  constructor(options: MuseAdapterOptions = {}) {
    this.home = options.homeDir ?? homeDir();
    this.parser = new MuseSessionParser();
    this.mapper = new MuseAgentMapper(this.parser);
  }

  canHandle(processInfo: ProcessInfo): boolean {
    const base = path.basename(processInfo.command.trim().split(/\s+/)[0] ?? "").toLowerCase();
    return base === "muse" || base === "muse.exe" || base.startsWith("muse-bin-");
  }

  async detectAgents(context?: AgentDetectionContext): Promise<AgentInfo[]> {
    try {
      return await this.detectRunningAgents(context);
    } finally {
      this.parser.pruneSessionCache();
    }
  }

  private async detectRunningAgents(context?: AgentDetectionContext): Promise<AgentInfo[]> {
    const { processes } = await findHarnessProcesses(this, context);
    if (processes.length === 0) return [];

    const { direct, legacyMatches } = this.createLocator().matchRunningProcesses(processes);
    const matchedPids = new Set([
      ...direct.map((d) => d.process.pid),
      ...legacyMatches.map((m) => m.process.pid),
    ]);
    const agents: AgentInfo[] = [];

    for (const match of direct) {
      const sessionData = this.parser.readSessionIncremental(
        match.sessionFile.filePath,
        match.sessionFile.resolvedCwd,
      );
      if (sessionData) {
        agents.push(
          this.mapper.mapSessionToAgent({
            session: sessionData,
            processInfo: match.process,
            sessionFile: match.sessionFile,
          }),
        );
      } else {
        matchedPids.delete(match.process.pid);
      }
    }

    for (const match of legacyMatches) {
      const sessionData = this.parser.readSessionIncremental(
        match.session.filePath,
        match.session.resolvedCwd,
      );
      if (sessionData) {
        agents.push(
          this.mapper.mapSessionToAgent({
            session: sessionData,
            processInfo: match.process,
            sessionFile: match.session,
          }),
        );
      } else {
        matchedPids.delete(match.process.pid);
      }
    }

    for (const proc of processes) {
      if (!matchedPids.has(proc.pid)) {
        agents.push(this.mapper.mapProcessOnlyAgent(proc));
      }
    }
    return agents;
  }

  private createLocator(): MuseSessionLocator {
    return new MuseSessionLocator({ homeDir: this.home });
  }

  getConversation(sessionFilePath: string, options?: ConversationOptions): ConversationMessage[] {
    return this.parser.getConversation(sessionFilePath, options);
  }

  async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
    const filterCwd = opts?.cwd;
    const summaries: SessionSummary[] = [];
    for (const { filePath, defaultCwd } of this.createLocator().discoverHistoricalSessionFiles()) {
      const summary = this.toSessionSummary(filePath, defaultCwd);
      if (!summary) continue;
      if (filterCwd !== undefined && summary.cwd !== filterCwd) continue;
      summaries.push(summary);
    }
    return summaries;
  }

  async findSessionsById(sessionId: string): Promise<SessionSummary[]> {
    return this.createLocator()
      .findHistoricalSessionFilesById(sessionId)
      .map(({ filePath, defaultCwd }) => this.toSessionSummary(filePath, defaultCwd))
      .filter((summary): summary is SessionSummary => summary?.sessionId === sessionId);
  }

  private toSessionSummary(filePath: string, defaultCwd: string): SessionSummary | null {
    const session = this.parser.readSession(filePath, defaultCwd);
    if (!session?.lastSignal && !session?.firstUserMessage) return null;
    const stat = safeStat(filePath);
    return {
      type: "muse",
      sessionId: session.sessionId,
      cwd: session.projectPath || defaultCwd,
      firstUserMessage: session.firstUserMessage || "",
      lastActive: session.lastActive ?? stat?.mtime ?? new Date(),
      startedAt: session.sessionStart ?? stat?.birthtime ?? stat?.mtime ?? new Date(),
      sessionFilePath: filePath,
    };
  }
}
