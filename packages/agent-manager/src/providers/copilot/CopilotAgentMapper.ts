import type { AgentInfo, ProcessInfo } from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import { generateAgentName } from "../../utils/matching.js";
import { CopilotSessionParser, type CopilotSession } from "./CopilotSessionParser.js";

export class CopilotAgentMapper {
  constructor(private readonly parser: CopilotSessionParser = new CopilotSessionParser()) {}

  mapSessionToAgent(session: CopilotSession, processInfo: ProcessInfo): AgentInfo {
    const projectPath = session.projectPath || processInfo.cwd || "";
    return {
      name: generateAgentName(projectPath, processInfo.pid),
      type: "copilot",
      status: this.parser.determineStatus(session),
      summary: session.summary || "Copilot session active",
      pid: processInfo.pid,
      projectPath,
      sessionId: session.sessionId,
      lastActive: session.lastActive,
      sessionFilePath: session.eventsFilePath,
    };
  }

  mapProcessOnlyAgent(processInfo: ProcessInfo): AgentInfo {
    return {
      name: generateAgentName(processInfo.cwd || "", processInfo.pid),
      type: "copilot",
      status: AgentStatus.RUNNING,
      summary: "Copilot process running",
      pid: processInfo.pid,
      projectPath: processInfo.cwd || "",
      sessionId: `pid-${processInfo.pid}`,
      lastActive: new Date(),
    };
  }
}
