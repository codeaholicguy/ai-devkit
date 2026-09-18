import type { AgentInfo, ProcessInfo } from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import { generateAgentName } from "../../utils/matching.js";
import type { OpenCodeSession } from "./OpenCodeSessionLocator.js";
import type { OpenCodeSessionStats } from "./OpenCodeSessionParser.js";

const SESSION_REF_SEP = "::";
const IDLE_THRESHOLD_MINUTES = 5;

function encodeSessionRef(dbPath: string, sessionId: string): string {
  return `${dbPath}${SESSION_REF_SEP}${sessionId}`;
}

export class OpenCodeAgentMapper {
  constructor(private readonly dbPath: string) {}

  mapSessionToAgent(
    session: OpenCodeSession,
    stats: OpenCodeSessionStats,
    proc: ProcessInfo,
  ): AgentInfo {
    const lastActive =
      stats.lastTimeUpdated > 0 ? new Date(stats.lastTimeUpdated) : new Date(session.timeCreated);

    return {
      name: generateAgentName(session.directory || proc.cwd || "", proc.pid),
      type: "opencode",
      status: this.determineStatus(stats, lastActive),
      summary: stats.summary || "OpenCode session active",
      pid: proc.pid,
      projectPath: session.directory || proc.cwd || "",
      sessionId: session.sessionId,
      lastActive,
      sessionFilePath: encodeSessionRef(this.dbPath, session.sessionId),
    };
  }

  mapProcessOnlyAgent(proc: ProcessInfo): AgentInfo {
    return {
      name: generateAgentName(proc.cwd || "", proc.pid),
      type: "opencode",
      status: AgentStatus.RUNNING,
      summary: "OpenCode process running",
      pid: proc.pid,
      projectPath: proc.cwd || "",
      sessionId: `pid-${proc.pid}`,
      lastActive: new Date(),
    };
  }

  private determineStatus(stats: OpenCodeSessionStats, lastActive: Date): AgentStatus {
    const ageMin = (Date.now() - lastActive.getTime()) / 60000;
    if (ageMin > IDLE_THRESHOLD_MINUTES) return AgentStatus.IDLE;

    if (stats.lastRole === "assistant" && !stats.lastAssistantCompleted) {
      return AgentStatus.RUNNING;
    }
    if (stats.lastRole === "assistant") return AgentStatus.WAITING;
    return AgentStatus.RUNNING;
  }
}
