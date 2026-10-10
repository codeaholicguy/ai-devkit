import type { AgentInfo, ProcessInfo } from "../../adapters/AgentAdapter.js";
import { generateAgentName } from "../../utils/matching.js";
import type { SessionFile } from "../../utils/session.js";
import { MuseSessionParser, type MuseSession } from "./MuseSessionParser.js";
import { processOnlyAgent } from "../shared.js";

export interface MuseSessionAgentInput {
  session: MuseSession;
  processInfo: ProcessInfo;
  sessionFile: SessionFile;
}

export class MuseAgentMapper {
  constructor(private readonly parser: MuseSessionParser = new MuseSessionParser()) {}

  mapSessionToAgent({ session, processInfo, sessionFile }: MuseSessionAgentInput): AgentInfo {
    return {
      name: generateAgentName(processInfo.cwd, processInfo.pid),
      type: "muse",
      status: this.parser.determineStatus(session),
      summary: session.lastUserMessage || "Session started",
      pid: processInfo.pid,
      projectPath: session.projectPath || sessionFile.resolvedCwd || processInfo.cwd || "",
      sessionId: sessionFile.sessionId,
      lastActive: session.lastActive,
      sessionFilePath: sessionFile.filePath,
    };
  }

  mapProcessOnlyAgent(processInfo: ProcessInfo): AgentInfo {
    return processOnlyAgent("muse", processInfo, { summary: "Muse process running" });
  }
}

