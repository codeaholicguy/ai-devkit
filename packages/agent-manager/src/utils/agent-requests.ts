import * as fs from 'fs';
import * as path from 'path';

export interface AgentRequest {
    sessionId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    timestamp: string;
}

export function getAgentRequestPath(homeDir: string, sessionId: string): string {
    return path.join(homeDir, '.ai-devkit', 'agent-requests', `${sessionId}.json`);
}

export function readLatestAgentRequest(homeDir: string, sessionId: string): AgentRequest | null {
    try {
        const raw = fs.readFileSync(getAgentRequestPath(homeDir, sessionId), 'utf-8');
        return JSON.parse(raw) as AgentRequest;
    } catch {
        return null;
    }
}

export function writeAgentRequest(homeDir: string, entry: AgentRequest): void {
    const filePath = getAgentRequestPath(homeDir, entry.sessionId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
}
