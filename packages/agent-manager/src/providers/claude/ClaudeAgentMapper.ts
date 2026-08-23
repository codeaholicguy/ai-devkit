import type { AgentInfo, ProcessInfo } from '../../adapters/AgentAdapter.js';
import { AgentStatus } from '../../adapters/AgentAdapter.js';
import { generateAgentName } from '../../utils/matching.js';
import type { SessionFile } from '../../utils/session.js';
import { ClaudeSessionParser, type ClaudeSession } from './ClaudeSessionParser.js';

export interface ClaudeAgentLiveInfo {
    pidStatus?: AgentStatus;
    waitingFor?: string;
}

export interface ClaudeSessionAgentInput {
    session: ClaudeSession;
    processInfo: ProcessInfo;
    sessionFile: SessionFile;
    liveInfo?: ClaudeAgentLiveInfo;
}

export class ClaudeAgentMapper {
    constructor(private readonly parser: ClaudeSessionParser = new ClaudeSessionParser()) {}

    mapSessionToAgent({
        session,
        processInfo,
        sessionFile,
        liveInfo,
    }: ClaudeSessionAgentInput): AgentInfo {
        const status = liveInfo?.pidStatus ?? this.parser.determineStatus(session);
        const baseSummary = session.lastUserMessage || 'Session started';
        const summary = status === AgentStatus.WAITING && liveInfo?.waitingFor
            ? `${baseSummary} — waiting for ${liveInfo.waitingFor}`
            : baseSummary;

        return {
            name: generateAgentName(processInfo.cwd, processInfo.pid),
            type: 'claude',
            status,
            summary,
            pid: processInfo.pid,
            projectPath: sessionFile.resolvedCwd || processInfo.cwd || '',
            sessionId: sessionFile.sessionId,
            lastActive: session.lastActive,
            sessionFilePath: sessionFile.filePath,
        };
    }

    mapProcessOnlyAgent(processInfo: ProcessInfo): AgentInfo {
        return {
            name: generateAgentName(processInfo.cwd || '', processInfo.pid),
            type: 'claude',
            status: AgentStatus.IDLE,
            summary: 'Unknown',
            pid: processInfo.pid,
            projectPath: processInfo.cwd || '',
            sessionId: `pid-${processInfo.pid}`,
            lastActive: new Date(),
        };
    }
}
