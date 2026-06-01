import type { StartableAgentType } from '@ai-devkit/agent-manager';

export type ConsoleAction =
    | { type: 'open'; agentName: string }
    | { type: 'send'; agentName: string; message: string }
    | { type: 'start'; agentType: StartableAgentType; name: string; cwd: string }
    | { type: 'kill'; agentName: string };
