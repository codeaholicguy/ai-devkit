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

export interface ConsoleMemoryItem {
    id: string;
    title: string;
    scope: string;
    tags: string[];
    updatedAt: string;
}

export interface MemoryListState {
    items: ConsoleMemoryItem[];
    total: number;
    isLoading: boolean;
    error: string | null;
    lastUpdated: Date | null;
}

export type RightPaneMode =
    | { type: 'preview' }
    | { type: 'start-agent' }
    | { type: 'rename-agent'; agentName: string }
    | { type: 'channel-select'; agentName: string }
    | { type: 'memory-list' }
    | { type: 'help' };

export type TransientMessage = { kind: 'info' | 'error'; text: string };
