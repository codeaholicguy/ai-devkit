import type { AgentInfo, ProcessInfo } from "../../adapters/AgentAdapter.js";
import { AgentStatus } from "../../adapters/AgentAdapter.js";
import { generateAgentName } from "../../utils/matching.js";
import { GrokSessionParser, type GrokSession } from "./GrokSessionParser.js";

export interface GrokSessionAgentInput {
  session: GrokSession;
  processInfo: ProcessInfo;
}

export class GrokAgentMapper {
  constructor(private readonly parser: GrokSessionParser = new GrokSessionParser()) {}

  mapSessionToAgent({ session, processInfo }: GrokSessionAgentInput): AgentInfo {
    return {
      name: generateAgentName(session.projectPath, processInfo.pid),
      type: "grok_cli",
      status: this.parser.determineStatus(session),
      summary: session.lastUserMessage || "Grok CLI session active",
      pid: processInfo.pid,
      projectPath: session.projectPath,
      sessionId: session.sessionId,
      lastActive: session.lastActive,
      sessionFilePath: session.sessionFilePath,
    };
  }

  /** `cwd` is already resolved by the locator (registry first, then process cwd). */
  mapProcessOnlyAgent(processInfo: ProcessInfo, cwd: string): AgentInfo {
    return {
      name: generateAgentName(cwd, processInfo.pid),
      type: "grok_cli",
      status: AgentStatus.RUNNING,
      summary: "Grok CLI process running",
      pid: processInfo.pid,
      projectPath: cwd,
      sessionId: `pid-${processInfo.pid}`,
      lastActive: new Date(),
    };
  }
}
