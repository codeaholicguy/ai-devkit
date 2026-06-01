import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { runAction } from '../actions/runAction.js';

type Transient = { kind: 'info' | 'error'; text: string };

interface ConsoleInputKey {
    escape?: boolean;
    return?: boolean;
}

interface UseKillAgentActionOptions {
    setTransient: Dispatch<SetStateAction<Transient | null>>;
}

export function useKillAgentAction({ setTransient }: UseKillAgentActionOptions) {
    const [pendingKillName, setPendingKillName] = useState<string | null>(null);

    const openKillConfirm = useCallback((agentName: string) => {
        setPendingKillName(agentName);
    }, []);

    const cancelKill = useCallback(() => {
        setPendingKillName(null);
    }, []);

    const confirmPendingKill = useCallback(() => {
        if (!pendingKillName) return;
        const agentName = pendingKillName;
        setPendingKillName(null);
        void runAction({ type: 'kill', agentName }).then(result => {
            if (result.error || (result.exitCode !== 0 && result.exitCode !== null)) {
                setTransient({ kind: 'error', text: result.error ?? `kill exited ${result.exitCode}` });
            } else {
                setTransient({ kind: 'info', text: `Killed ${agentName}` });
            }
        });
    }, [pendingKillName, setTransient]);

    const handleKillInput = useCallback((input: string, key: ConsoleInputKey): boolean => {
        if (!pendingKillName) return false;
        if (key.escape || input === 'n') {
            cancelKill();
            return true;
        }
        if (key.return || input === 'y') {
            confirmPendingKill();
            return true;
        }
        return true;
    }, [cancelKill, confirmPendingKill, pendingKillName]);

    return {
        pendingKillName,
        openKillConfirm,
        handleKillInput,
    };
}
