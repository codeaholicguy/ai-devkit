import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { runAction, type ActionResult } from '../actions/runAction.js';
import type { ConsoleFocus, RightPaneMode, TransientMessage } from '../types.js';

interface UseRenameAgentPaneOptions {
    setFocus: Dispatch<SetStateAction<ConsoleFocus>>;
    setRightPaneMode: Dispatch<SetStateAction<RightPaneMode>>;
    setTransient: Dispatch<SetStateAction<TransientMessage | null>>;
}

interface RenameAgentValues {
    newName: string;
}

export function getRenameActionError(result: ActionResult): string | null {
    if (result.error) return result.error;
    if (result.exitCode !== 0 && result.exitCode !== null) return `rename exited ${result.exitCode}`;
    return null;
}

export function useRenameAgentPane({
    setFocus,
    setRightPaneMode,
    setTransient,
}: UseRenameAgentPaneOptions) {
    const [renamePaneError, setRenamePaneError] = useState<string | null>(null);
    const [isRenamingAgent, setIsRenamingAgent] = useState(false);

    const openRenamePane = useCallback((agentName: string) => {
        setRenamePaneError(null);
        setFocus('list');
        setRightPaneMode({ type: 'rename-agent', agentName });
    }, [setFocus, setRightPaneMode]);

    const handleRenameCancel = useCallback(() => {
        if (isRenamingAgent) return;
        setRightPaneMode({ type: 'preview' });
        setRenamePaneError(null);
    }, [isRenamingAgent, setRightPaneMode]);

    const handleRenameSubmit = useCallback((currentName: string, values: RenameAgentValues) => {
        if (isRenamingAgent) return;
        setIsRenamingAgent(true);
        setRenamePaneError(null);
        void runAction({ type: 'rename', currentName, newName: values.newName }).then(result => {
            const error = getRenameActionError(result);
            if (error) {
                setRenamePaneError(error);
                return;
            }
            setRightPaneMode({ type: 'preview' });
            setTransient({ kind: 'info', text: `Renamed ${currentName} to ${values.newName}` });
        }).finally(() => {
            setIsRenamingAgent(false);
        });
    }, [isRenamingAgent, setRightPaneMode, setTransient]);

    return {
        renamePaneError,
        isRenamingAgent,
        openRenamePane,
        handleRenameCancel,
        handleRenameSubmit,
    };
}
