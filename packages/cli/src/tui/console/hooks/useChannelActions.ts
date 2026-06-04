import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { AgentInfo } from '@ai-devkit/agent-manager';
import { runAction } from '../actions/runAction.js';
import type { ActionResult } from '../actions/runAction.js';
import type { AgentChannelStatusMap, RightPaneMode, TransientMessage } from '../types.js';

interface UseChannelActionsInput {
    channelStatuses: AgentChannelStatusMap;
    refreshChannels: () => Promise<void>;
    refreshConfiguredChannels: () => Promise<void>;
    setRightPaneMode: Dispatch<SetStateAction<RightPaneMode>>;
    setTransient: Dispatch<SetStateAction<TransientMessage | null>>;
}

interface UseChannelActionsResult {
    openChannelSelect: (agent: AgentInfo | null) => void;
    startChannel: (channelName: string, agentName: string) => void;
    stopAgentChannel: (agent: AgentInfo | null) => void;
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

export function getChannelActionError(actionName: 'channel start' | 'channel stop', result: ActionResult): string | null {
    if (result.error) return result.error;
    if (result.exitCode !== 0 && result.exitCode !== null) return `${actionName} exited ${result.exitCode}`;
    return null;
}

export function getConnectedChannelName(
    agent: AgentInfo | null,
    channelStatuses: AgentChannelStatusMap,
): string | null {
    return agent ? channelStatuses[agent.name]?.channelName ?? null : null;
}

export function useChannelActions({
    channelStatuses,
    refreshChannels,
    refreshConfiguredChannels,
    setRightPaneMode,
    setTransient,
}: UseChannelActionsInput): UseChannelActionsResult {
    const openChannelSelect = useCallback((agent: AgentInfo | null) => {
        if (!agent) return;
        void refreshConfiguredChannels()
            .finally(() => {
                setRightPaneMode({ type: 'channel-select', agentName: agent.name });
            })
            .catch(err => {
                setTransient({ kind: 'error', text: errorMessage(err) });
            });
    }, [refreshConfiguredChannels, setRightPaneMode, setTransient]);

    const startChannel = useCallback((channelName: string, agentName: string) => {
        void runAction({ type: 'channel-start', channelName, agentName })
            .then(async result => {
                const actionError = getChannelActionError('channel start', result);
                if (actionError) {
                    setTransient({ kind: 'error', text: actionError });
                    return;
                }

                await refreshChannels();
                setRightPaneMode({ type: 'preview' });
                setTransient({ kind: 'info', text: `Channel connected: ${channelName} -> ${agentName}` });
            })
            .catch(err => {
                setTransient({ kind: 'error', text: errorMessage(err) });
            });
    }, [refreshChannels, setRightPaneMode, setTransient]);

    const stopAgentChannel = useCallback((agent: AgentInfo | null) => {
        const channelName = getConnectedChannelName(agent, channelStatuses);
        if (!channelName) {
            setTransient({ kind: 'error', text: 'Selected agent is not connected to a channel' });
            return;
        }

        void runAction({ type: 'channel-stop', channelName })
            .then(async result => {
                const actionError = getChannelActionError('channel stop', result);
                if (actionError) {
                    setTransient({ kind: 'error', text: actionError });
                    return;
                }

                await refreshChannels();
                setTransient({ kind: 'info', text: `Channel stopped: ${channelName}` });
            })
            .catch(err => {
                setTransient({ kind: 'error', text: errorMessage(err) });
            });
    }, [channelStatuses, refreshChannels, setTransient]);

    return {
        openChannelSelect,
        startChannel,
        stopAgentChannel,
    };
}
