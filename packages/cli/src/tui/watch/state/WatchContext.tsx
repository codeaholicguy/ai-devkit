import React, { createContext, useContext, useMemo } from 'react';
import type { AgentManager } from '@ai-devkit/agent-manager';
import { useAgentList, type UseAgentListResult } from '../hooks/useAgentList.js';

interface WatchContextValue extends UseAgentListResult {
    manager: AgentManager;
    inputFocused: boolean;
}

const WatchContext = createContext<WatchContextValue | null>(null);

export const useWatchContext = (): WatchContextValue => {
    const ctx = useContext(WatchContext);
    if (!ctx) throw new Error('useWatchContext must be used inside <WatchProvider>');
    return ctx;
};

interface WatchProviderProps {
    manager: AgentManager;
    inputFocused: boolean;
    children: React.ReactNode;
}

export const WatchProvider: React.FC<WatchProviderProps> = ({ manager, inputFocused, children }) => {
    // Pause list poll while user is composing a message: removes a source of
    // re-renders that compete with the controlled TextInput.
    const list = useAgentList(manager, undefined, inputFocused);
    const value = useMemo<WatchContextValue>(
        () => ({ ...list, manager, inputFocused }),
        [list, manager, inputFocused],
    );
    return <WatchContext.Provider value={value}>{children}</WatchContext.Provider>;
};
