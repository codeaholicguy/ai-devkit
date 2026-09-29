import type { AgentInfo, ProcessInfo } from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import { generateAgentName } from "../../utils/matching.js";
import { AntigravitySessionParser, type AntigravitySession } from "./AntigravitySessionParser.js";

export interface AntigravitySessionAgentInput {
  session: AntigravitySession;
  processInfo: ProcessInfo;
}

export class AntigravityAgentMapper {
  constructor(private readonly parser: AntigravitySessionParser = new AntigravitySessionParser()) {}

  mapSessionToAgent({ session, processInfo }: AntigravitySessionAgentInput): AgentInfo {
    return {
      name: generateAgentName(session.projectPath, processInfo.pid),
      type: "antigravity_cli",
      status: this.parser.determineStatus(session),
      summary: session.lastUserMessage || "Antigravity CLI session active",
      pid: processInfo.pid,
      projectPath: session.projectPath,
      sessionId: session.sessionId,
      lastActive: session.lastActive,
      sessionFilePath: session.sessionFilePath,
    };
  }

  mapProcessOnlyAgent(processInfo: ProcessInfo, cwd: string): AgentInfo {
    return {
      name: generateAgentName(cwd, processInfo.pid),
      type: "antigravity_cli",
      status: AgentStatus.RUNNING,
      summary: "Antigravity CLI process running",
      pid: processInfo.pid,
      projectPath: cwd,
      sessionId: `pid-${processInfo.pid}`,
      lastActive: new Date(),
    };
  }
}
