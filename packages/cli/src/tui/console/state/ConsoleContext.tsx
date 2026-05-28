import React, { createContext, useContext, useMemo } from 'react';
import type { AgentManager } from '@ai-devkit/agent-manager';
import { useAgentList, type UseAgentListResult } from '../hooks/useAgentList.js';

interface ConsoleContextValue extends UseAgentListResult {
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
    children: React.ReactNode;
}

export const ConsoleProvider: React.FC<ConsoleProviderProps> = ({ manager, inputFocused, children }) => {
    // Pause list poll while user is composing a message: removes a source of
    // re-renders that compete with the controlled TextInput.
    const list = useAgentList(manager, undefined, inputFocused);
    const value = useMemo<ConsoleContextValue>(
        () => ({ ...list, manager, inputFocused }),
        [list, manager, inputFocused],
    );
    return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
};
