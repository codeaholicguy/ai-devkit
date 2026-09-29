import type { AgentInfo, ProcessInfo } from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import { generateAgentName } from "../../utils/matching.js";
import { KiroSessionParser, type KiroSession } from "./KiroSessionParser.js";

const SUMMARY_MAX_LENGTH = 120;

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
    return {
      name: generateAgentName(processInfo.cwd, processInfo.pid),
      type: "kiro",
      status: AgentStatus.RUNNING,
      summary: "Kiro process running",
      pid: processInfo.pid,
      projectPath: processInfo.cwd,
      sessionId: `pid-${processInfo.pid}`,
      lastActive: new Date(),
    };
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}
