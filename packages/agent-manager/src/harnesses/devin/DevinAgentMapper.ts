import type { AgentInfo, ProcessInfo } from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import { generateAgentName } from "../../utils/matching.js";
import type { DevinSession } from "./DevinSessionLocator.js";
import { encodeDevinSessionRef } from "./DevinSessionLocator.js";
import type { DevinSessionStats } from "./DevinSessionParser.js";
import { isIdle, processOnlyAgent } from "../shared.js";

export class DevinAgentMapper {
  constructor(private readonly dbPath: string) {}

  mapSessionToAgent(
    session: DevinSession,
    stats: DevinSessionStats,
    proc: ProcessInfo,
  ): AgentInfo {
    const lastActive =
      stats.lastTimeUpdated > 0
        ? new Date(stats.lastTimeUpdated)
        : new Date(session.lastActivityAt || session.timeCreated);

    return {
      name: generateAgentName(session.directory || proc.cwd || "", proc.pid),
      type: "devin",
      status: this.determineStatus(stats, lastActive),
      summary: stats.summary || session.title || "Devin session active",
      pid: proc.pid,
      projectPath: session.directory || proc.cwd || "",
      sessionId: session.sessionId,
      lastActive,
      sessionFilePath: encodeDevinSessionRef(this.dbPath, session.sessionId),
    };
  }

  mapProcessOnlyAgent(proc: ProcessInfo): AgentInfo {
    return processOnlyAgent("devin", proc, { summary: "Devin process running" });
  }

  private determineStatus(stats: DevinSessionStats, lastActive: Date): AgentStatus {
    if (isIdle(lastActive)) return AgentStatus.IDLE;
    return stats.lastRole === "assistant" ? AgentStatus.WAITING : AgentStatus.RUNNING;
  }
}
