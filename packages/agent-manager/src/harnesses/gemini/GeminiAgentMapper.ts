import type { AgentInfo, ProcessInfo } from "../../adapters/AgentAdapter.js";
import { generateAgentName } from "../../utils/matching.js";
import { GeminiSessionParser, type GeminiSession } from "./GeminiSessionParser.js";
import { processOnlyAgent } from "../shared.js";

export class GeminiAgentMapper {
  constructor(private readonly parser: GeminiSessionParser = new GeminiSessionParser()) {}

  mapSessionToAgent(session: GeminiSession, processInfo: ProcessInfo, filePath: string): AgentInfo {
    const projectPath = session.projectPath || processInfo.cwd || "";
    return {
      name: generateAgentName(projectPath, processInfo.pid),
      type: "gemini_cli",
      status: this.parser.determineStatus(session),
      summary: session.summary || "Gemini CLI session active",
      pid: processInfo.pid,
      projectPath,
      sessionId: session.sessionId,
      lastActive: session.lastActive,
      sessionFilePath: filePath,
    };
  }

  mapProcessOnlyAgent(processInfo: ProcessInfo): AgentInfo {
    return processOnlyAgent("gemini_cli", processInfo, { summary: "Gemini CLI process running" });
  }
}
