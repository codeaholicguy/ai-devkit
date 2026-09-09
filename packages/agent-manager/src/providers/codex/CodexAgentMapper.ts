import type { AgentInfo, ProcessInfo } from '../../adapters/AgentAdapter.js';
import { AgentStatus } from '../../adapters/AgentAdapter.js';
import { generateAgentName } from '../../utils/matching.js';
import type { CodexSessionParser, CodexSession } from './CodexSessionParser.js';

export class CodexAgentMapper {
    constructor(private readonly parser: CodexSessionParser) {}

    mapSessionToAgent(session: CodexSession, processInfo: ProcessInfo, filePath: string): AgentInfo {
        return {
            name: generateAgentName(session.projectPath || processInfo.cwd || '', processInfo.pid),
            type: 'codex',
            status: this.parser.determineStatus(session),
            summary: session.summary || 'Codex session active',
            pid: processInfo.pid,
            projectPath: session.projectPath || processInfo.cwd || '',
            sessionId: session.sessionId,
            lastActive: session.lastActive,
            sessionFilePath: filePath,
        };
    }

    mapProcessOnlyAgent(processInfo: ProcessInfo): AgentInfo {
        return {
            name: generateAgentName(processInfo.cwd || '', processInfo.pid),
            type: 'codex',
            status: AgentStatus.RUNNING,
            summary: 'Codex process running',
            pid: processInfo.pid,
            projectPath: processInfo.cwd || '',
            sessionId: `pid-${processInfo.pid}`,
            lastActive: new Date(),
        };
    }
}
