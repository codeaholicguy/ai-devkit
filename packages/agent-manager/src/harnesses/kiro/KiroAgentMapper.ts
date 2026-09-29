import type { AgentInfo, ProcessInfo } from "../../adapters/AgentAdapter.js";
import { generateAgentName } from "../../utils/matching.js";
import { processOnlyAgent, SUMMARY_MAX_LENGTH, truncate } from "../shared.js";
import { KiroSessionParser, type KiroSession } from "./KiroSessionParser.js";

export interface KiroSessionAgentInput {
  session: KiroSession;
  processInfo: ProcessInfo;
}

export class KiroAgentMapper {
  constructor(private readonly parser: KiroSessionParser = new KiroSessionParser()) {}

  mapSessionToAgent({ session, processInfo }: KiroSessionAgentInput): AgentInfo {
    return {
      name: generateAgentName(session.projectPath, processInfo.pid),
      type: "kiro",
      status: this.parser.determineStatus(session),
      summary: truncate(
        session.lastUserMessage || session.title || "Kiro session active",
        SUMMARY_MAX_LENGTH,
      ),
      pid: processInfo.pid,
      projectPath: session.projectPath,
      sessionId: session.sessionId,
      lastActive: session.lastActive,
      sessionFilePath: session.sessionFilePath,
    };
  }

  mapProcessOnlyAgent(processInfo: ProcessInfo): AgentInfo {
    return processOnlyAgent("kiro", processInfo, { summary: "Kiro process running" });
  }
}
