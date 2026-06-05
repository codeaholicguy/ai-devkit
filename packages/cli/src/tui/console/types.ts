export type ConsoleFocus = 'list' | 'input';

export interface AgentChannelStatus {
    channelName: string;
    channelType: string;
    bridgePid: number;
}

export type AgentChannelStatusMap = Record<string, AgentChannelStatus>;

export interface ConfiguredChannel {
    name: string;
    type: string;
    enabled: boolean;
    botUsername?: string;
}

export type RightPaneMode =
    | { type: 'preview' }
    | { type: 'start-agent' }
    | { type: 'rename-agent'; agentName: string }
    | { type: 'channel-select'; agentName: string }
    | { type: 'help' };

export type TransientMessage = { kind: 'info' | 'error'; text: string };
