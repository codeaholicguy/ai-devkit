import React, { createContext, useContext, useMemo } from 'react';
import type { AgentManager } from '@ai-devkit/agent-manager';
import { ConfigStore } from '@ai-devkit/channel-connector';
import { ChannelService } from '../../../services/channel/channel.service.js';
import { useAgentList, type UseAgentListResult } from '../hooks/useAgentList.js';
import {
    buildAgentChannelStatuses,
    buildConfiguredChannels,
    useChannelState,
    type UseChannelStateResult,
} from '../hooks/useChannelState.js';

export { buildAgentChannelStatuses, buildConfiguredChannels };

interface ConsoleAgentContextValue extends UseAgentListResult {
    manager: AgentManager;
    inputFocused: boolean;
}

type ConsoleChannelContextValue = UseChannelStateResult;

const ConsoleAgentContext = createContext<ConsoleAgentContextValue | null>(null);
const ConsoleChannelContext = createContext<ConsoleChannelContextValue | null>(null);

export const useConsoleAgentContext = (): ConsoleAgentContextValue => {
    const ctx = useContext(ConsoleAgentContext);
    if (!ctx) throw new Error('useConsoleAgentContext must be used inside <ConsoleProvider>');
    return ctx;
};

export const useConsoleChannelContext = (): ConsoleChannelContextValue => {
    const ctx = useContext(ConsoleChannelContext);
    if (!ctx) throw new Error('useConsoleChannelContext must be used inside <ConsoleProvider>');
    return ctx;
};

export const useConsoleContext = (): ConsoleAgentContextValue & ConsoleChannelContextValue => {
    const agentContext = useConsoleAgentContext();
    const channelContext = useConsoleChannelContext();
    return useMemo(
        () => ({ ...agentContext, ...channelContext }),
        [agentContext, channelContext],
    );
};

interface ConsoleProviderProps {
    manager: AgentManager;
    inputFocused: boolean;
    channelService?: ChannelService;
    configStore?: ConfigStore;
    children: React.ReactNode;
}

export const ConsoleProvider: React.FC<ConsoleProviderProps> = ({
    manager,
    inputFocused,
    channelService,
    configStore,
    children,
}) => {
    // Pause list poll while user is composing a message: removes a source of
    // re-renders that compete with the controlled TextInput.
    const list = useAgentList(manager, undefined, inputFocused);
    const channelState = useChannelState(channelService, configStore, undefined, inputFocused);

    const agentValue = useMemo<ConsoleAgentContextValue>(
        () => ({
            agents: list.agents,
            error: list.error,
            lastUpdated: list.lastUpdated,
            isLoading: list.isLoading,
            refresh: list.refresh,
            manager,
            inputFocused,
        }),
        [
            list.agents,
            list.error,
            list.lastUpdated,
            list.isLoading,
            list.refresh,
            manager,
            inputFocused,
        ],
    );
    const channelValue = useMemo<ConsoleChannelContextValue>(
        () => ({
            channelStatuses: channelState.channelStatuses,
            refreshChannels: channelState.refreshChannels,
            configuredChannels: channelState.configuredChannels,
            refreshConfiguredChannels: channelState.refreshConfiguredChannels,
        }),
        [
            channelState.channelStatuses,
            channelState.refreshChannels,
            channelState.configuredChannels,
            channelState.refreshConfiguredChannels,
        ],
    );
    return (
        <ConsoleAgentContext.Provider value={agentValue}>
            <ConsoleChannelContext.Provider value={channelValue}>
                {children}
            </ConsoleChannelContext.Provider>
        </ConsoleAgentContext.Provider>
    );
};
