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
import { safeStat } from "../../utils/session.js";
import { ClaudeSessionParser } from "./ClaudeSessionParser.js";
import { ClaudeAgentMapper } from "./ClaudeAgentMapper.js";
import { ClaudeSessionLocator } from "./ClaudeSessionLocator.js";
import { findHarnessProcesses, homeDir, matchesExecutable } from "../shared.js";

/**
 * Claude Code Adapter
 *
 * Detects Claude Code agents by:
 * 1. Filtering Claude processes from a shared asynchronous process snapshot
 * 2. Using snapshot CWD and start-time enrichment
 * 3. Attempting authoritative PID-file matching via ~/.claude/sessions/<pid>.json
 * 4. Falling back to CWD+birthtime heuristic (matchProcessesToSessions) for processes without a PID file
 * 5. Extracting summary from last user message in session JSONL (incrementally
 *    cached across refreshes, so unchanged transcripts are not re-read)
 */
export class ClaudeCodeAdapter implements AgentAdapter {
  readonly type = "claude" as const;
  readonly processNames = ["claude"] as const;

  private parser: ClaudeSessionParser;
  private mapper: ClaudeAgentMapper;
  private projectsDir: string;
  private sessionsDir: string;

  constructor() {
    this.projectsDir = path.join(homeDir(), ".claude", "projects");
    this.sessionsDir = path.join(homeDir(), ".claude", "sessions");
    this.parser = new ClaudeSessionParser();
    this.mapper = new ClaudeAgentMapper(this.parser);
  }

  canHandle(processInfo: ProcessInfo): boolean {
    return matchesExecutable(processInfo.command, "claude");
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
    const { processes } = await findHarnessProcesses(this, context);
    if (processes.length === 0) {
      return [];
    }

    const { direct, legacyMatches } = this.createLocator().matchRunningProcesses(processes);

    const matchedPids = new Set([
      ...direct.map((d) => d.process.pid),
      ...legacyMatches.map((m) => m.process.pid),
    ]);

    const agents: AgentInfo[] = [];

    // Build agents from direct (resume + PID-file) matches
    for (const match of direct) {
      const { process: proc, sessionFile } = match;
      const sessionData = this.parser.readSessionIncremental(
        sessionFile.filePath,
        sessionFile.resolvedCwd,
      );
      if (sessionData) {
        agents.push(
          this.mapper.mapSessionToAgent({
            session: sessionData,
            processInfo: proc,
            sessionFile,
            liveInfo: {
              pidStatus: match.pidStatus,
              waitingFor: match.waitingFor,
            },
          }),
        );
      } else {
        matchedPids.delete(proc.pid);
      }
    }

    // Build agents from legacy matches
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

    // Any process with no match (direct or legacy) appears as IDLE
    for (const proc of processes) {
      if (!matchedPids.has(proc.pid)) {
        agents.push(this.mapper.mapProcessOnlyAgent(proc));
      }
    }

    return agents;
  }

  private createLocator(): ClaudeSessionLocator {
    return new ClaudeSessionLocator({
      projectsDir: this.projectsDir,
      sessionsDir: this.sessionsDir,
    });
  }

  getConversation(sessionFilePath: string, options?: ConversationOptions): ConversationMessage[] {
    return this.parser.getConversation(sessionFilePath, options);
  }

  async listSessions(opts?: ListSessionsOptions): Promise<SessionSummary[]> {
    const filterCwd = opts?.cwd;
    const candidates = this.createLocator().discoverHistoricalSessionFiles();
    const summaries: SessionSummary[] = [];

    for (const { filePath, defaultCwd } of candidates) {
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
    if (!session?.lastEntryType) return null;

    const recordedCwd = session.lastCwd || defaultCwd;
    const stat = safeStat(filePath);
    return {
      type: "claude",
      sessionId: session.sessionId,
      cwd: recordedCwd,
      firstUserMessage: session.firstUserMessage || "",
      lastActive: session.lastActive ?? stat?.mtime ?? new Date(),
      startedAt: session.sessionStart ?? stat?.birthtime ?? stat?.mtime ?? new Date(),
      sessionFilePath: filePath,
    };
  }
}
