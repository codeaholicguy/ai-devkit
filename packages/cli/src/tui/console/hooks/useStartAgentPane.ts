import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { StartableAgentType } from '@ai-devkit/agent-manager';
import type { RunConsoleAction } from '../actions/pendingAction.js';
import { generateAgentName } from '../../../util/agent.js';
import type { ConsoleFocus, RightPaneMode, TransientMessage } from '../types.js';

type StartDefaults = { name: string; cwd: string };

interface UseStartAgentPaneOptions {
    runConsoleAction: RunConsoleAction;
    refresh: () => Promise<void>;
    setFocus: Dispatch<SetStateAction<ConsoleFocus>>;
    setRightPaneMode: Dispatch<SetStateAction<RightPaneMode>>;
    setTransient: Dispatch<SetStateAction<TransientMessage | null>>;
}

interface StartAgentValues {
    type: StartableAgentType;
    name: string;
    cwd: string;
}

function createStartDefaults(): StartDefaults {
    const cwd = process.cwd();
    return { name: generateAgentName(cwd), cwd };
}

export function useStartAgentPane({
    runConsoleAction,
    refresh,
    setFocus,
    setRightPaneMode,
    setTransient,
}: UseStartAgentPaneOptions) {
    const [startPaneError, setStartPaneError] = useState<string | null>(null);
    const [isStartingAgent, setIsStartingAgent] = useState(false);
    const [startDefaults, setStartDefaults] = useState<StartDefaults>(createStartDefaults);

    const openStartPane = useCallback(() => {
        setStartDefaults(createStartDefaults());
        setStartPaneError(null);
        setFocus('list');
        setRightPaneMode({ type: 'start-agent' });
    }, [setFocus, setRightPaneMode]);

    const handleStartCancel = useCallback(() => {
        if (isStartingAgent) return;
        setRightPaneMode({ type: 'preview' });
        setStartPaneError(null);
    }, [isStartingAgent, setRightPaneMode]);

    const handleStartSubmit = useCallback((values: StartAgentValues) => {
        if (isStartingAgent) return;
        setIsStartingAgent(true);
        setStartPaneError(null);
        const action = runConsoleAction({ type: 'start', agentType: values.type, name: values.name, cwd: values.cwd });
        if (!action) return;
        void action.then(async result => {
            if (result.error || (result.exitCode !== 0 && result.exitCode !== null)) {
                setStartPaneError(result.error ?? `start exited ${result.exitCode}`);
                return;
            }
            setRightPaneMode({ type: 'preview' });
            setTransient({ kind: 'info', text: `Started ${values.name}` });
            await refresh();
        }).finally(() => {
            setIsStartingAgent(false);
        });
    }, [isStartingAgent, refresh, runConsoleAction, setRightPaneMode, setTransient]);

    return {
        startDefaults,
        startPaneError,
        isStartingAgent,
        openStartPane,
        handleStartCancel,
        handleStartSubmit,
    };
}
