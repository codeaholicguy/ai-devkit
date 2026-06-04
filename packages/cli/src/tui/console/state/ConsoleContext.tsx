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

interface ConsoleContextValue extends UseAgentListResult, UseChannelStateResult {
    manager: AgentManager;
    inputFocused: boolean;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export const useConsoleContext = (): ConsoleContextValue => {
    const ctx = useContext(ConsoleContext);
    if (!ctx) throw new Error('useConsoleContext must be used inside <ConsoleProvider>');
    return ctx;
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

    const value = useMemo<ConsoleContextValue>(
        () => ({
            ...list,
            ...channelState,
            manager,
            inputFocused,
        }),
        [list, channelState, manager, inputFocused],
    );
    return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
};
