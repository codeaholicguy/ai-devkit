import type { AgentInfo, ProcessInfo } from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import { generateAgentName } from "../../utils/matching.js";
import { type PiSession, PiSessionParser } from "./PiSessionParser.js";

export class PiAgentMapper {
  constructor(private readonly parser: PiSessionParser = new PiSessionParser()) {}

  mapSessionToAgent(session: PiSession, processInfo: ProcessInfo, filePath: string): AgentInfo {
    const projectPath = session.projectPath || processInfo.cwd || "";
    return {
      name: generateAgentName(projectPath, processInfo.pid),
      type: "pi",
      status: this.parser.determineStatus(session),
      summary: session.summary || "Pi session active",
      pid: processInfo.pid,
      projectPath,
      sessionId: session.sessionId,
      lastActive: session.lastActive,
      sessionFilePath: filePath,
    };
  }

  mapProcessOnlyAgent(processInfo: ProcessInfo): AgentInfo {
    return {
      name: generateAgentName(processInfo.cwd || "", processInfo.pid),
      type: "pi",
      status: AgentStatus.RUNNING,
      summary: "Pi process running",
      pid: processInfo.pid,
      projectPath: processInfo.cwd || "",
      sessionId: `pid-${processInfo.pid}`,
      lastActive: new Date(),
    };
  }
}
