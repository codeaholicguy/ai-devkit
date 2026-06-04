import type { StartableAgentType } from '@ai-devkit/agent-manager';

export type ConsoleAction =
    | { type: 'open'; agentName: string }
    | { type: 'send'; agentName: string; message: string }
    | { type: 'start'; agentType: StartableAgentType; name: string; cwd: string }
    | { type: 'kill'; agentName: string }
    | { type: 'rename'; currentName: string; newName: string }
    | { type: 'channel-start'; channelName: string; agentName: string }
    | { type: 'channel-stop'; channelName: string };
