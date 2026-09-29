import type { AgentInfo, ProcessInfo } from "../../adapters/AgentAdapter.js";
import { generateAgentName } from "../../utils/matching.js";
import { type PiSession, PiSessionParser } from "./PiSessionParser.js";
import { processOnlyAgent } from "../shared.js";

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
    return processOnlyAgent("pi", processInfo, { summary: "Pi process running" });
  }
}
