import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { runAction } from '../actions/runAction.js';
import type { TransientMessage } from '../types.js';

interface ConsoleInputKey {
    escape?: boolean;
    return?: boolean;
}

interface UseKillAgentActionOptions {
    setTransient: Dispatch<SetStateAction<TransientMessage | null>>;
}

export type KillInputDecision = 'none' | 'cancel' | 'confirm' | 'consume';

export function getKillInputDecision(
    pendingKillName: string | null,
    input: string,
    key: ConsoleInputKey,
): KillInputDecision {
    if (!pendingKillName) return 'none';
    if (key.escape || input === 'n') return 'cancel';
    if (key.return || input === 'y') return 'confirm';
    return 'consume';
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
        switch (getKillInputDecision(pendingKillName, input, key)) {
            case 'none':
                return false;
            case 'cancel':
                cancelKill();
                return true;
            case 'confirm':
                confirmPendingKill();
                return true;
            case 'consume':
                return true;
        }
    }, [cancelKill, confirmPendingKill, pendingKillName]);

    return {
        pendingKillName,
        openKillConfirm,
        handleKillInput,
    };
}
