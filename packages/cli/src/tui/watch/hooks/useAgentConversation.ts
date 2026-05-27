import fs from 'fs';
import { useEffect, useRef, useState } from 'react';
import type { AgentInfo, AgentManager, ConversationMessage } from '@ai-devkit/agent-manager';

export interface ConversationFetchError {
    kind: 'no-session-file' | 'no-adapter' | 'parse-error' | 'agent-not-found';
    message: string;
}

export interface UseAgentConversationResult {
    messages: ConversationMessage[];
    error: ConversationFetchError | null;
    lastUpdated: Date | null;
    isLoading: boolean;
}

export const PREVIEW_POLL_INTERVAL_MS = 3000;
export const PREVIEW_TAIL = 20;
export const SELECTION_DEBOUNCE_MS = 150;

interface Params {
    manager: AgentManager;
    agent: AgentInfo | null;
    intervalMs?: number;
    tail?: number;
    paused?: boolean;
}

function messagesEqual(a: ConversationMessage[], b: ConversationMessage[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].role !== b[i].role) return false;
        if (a[i].content !== b[i].content) return false;
        if (a[i].timestamp !== b[i].timestamp) return false;
    }
    return true;
}

const EMPTY_STATE: UseAgentConversationResult = {
    messages: [],
    error: null,
    lastUpdated: null,
    isLoading: false,
};

export function useAgentConversation({
    manager,
    agent,
    intervalMs = PREVIEW_POLL_INTERVAL_MS,
    tail = PREVIEW_TAIL,
    paused = false,
}: Params): UseAgentConversationResult {
    const [state, setState] = useState<UseAgentConversationResult>(EMPTY_STATE);

    const runTokenRef = useRef(0);
    const mountedRef = useRef(true);
    const lastMtimeRef = useRef<number | null>(null);

    useEffect(() => {
        mountedRef.current = true;

        if (!agent) {
            setState(prev => prev === EMPTY_STATE ? prev : EMPTY_STATE);
            lastMtimeRef.current = null;
            return () => { mountedRef.current = false; };
        }

        // Selection change → fresh state, single render.
        setState({ messages: [], error: null, lastUpdated: null, isLoading: true });
        lastMtimeRef.current = null;

        const fetchOnce = (): void => {
            const token = ++runTokenRef.current;

            if (!agent.sessionFilePath) {
                if (token !== runTokenRef.current || !mountedRef.current) return;
                setState(prev => prev.error?.kind === 'no-session-file' && !prev.isLoading
                    ? prev
                    : {
                        messages: [],
                        error: { kind: 'no-session-file', message: `No session file for "${agent.name}".` },
                        lastUpdated: prev.lastUpdated,
                        isLoading: false,
                    });
                return;
            }

            const adapter = manager.getAdapter(agent.type);
            if (!adapter) {
                if (token !== runTokenRef.current || !mountedRef.current) return;
                setState(prev => prev.error?.kind === 'no-adapter' && !prev.isLoading
                    ? prev
                    : {
                        messages: [],
                        error: { kind: 'no-adapter', message: `Unsupported agent type: ${agent.type}` },
                        lastUpdated: prev.lastUpdated,
                        isLoading: false,
                    });
                return;
            }

            try {
                let mtime: number | null = null;
                try {
                    mtime = fs.statSync(agent.sessionFilePath).mtimeMs;
                } catch {
                    mtime = null;
                }
                // mtime didn't change → no need to re-parse. Skip state update.
                if (mtime !== null && lastMtimeRef.current === mtime) {
                    if (token !== runTokenRef.current || !mountedRef.current) return;
                    setState(prev => prev.isLoading || prev.error
                        ? { ...prev, isLoading: false, error: null }
                        : prev);
                    return;
                }

                const conversation = adapter.getConversation(agent.sessionFilePath, { verbose: false });
                if (token !== runTokenRef.current || !mountedRef.current) return;

                const sliced = tail > 0 && conversation.length > tail
                    ? conversation.slice(-tail)
                    : conversation;
                lastMtimeRef.current = mtime;
                setState(prev => {
                    const changed = !messagesEqual(prev.messages, sliced);
                    if (!changed && prev.error === null && !prev.isLoading && prev.lastUpdated !== null) {
                        return prev;
                    }
                    return {
                        messages: changed ? sliced : prev.messages,
                        error: null,
                        lastUpdated: new Date(),
                        isLoading: false,
                    };
                });
            } catch (err) {
                if (token !== runTokenRef.current || !mountedRef.current) return;
                const message = err instanceof Error ? err.message : String(err);
                setState(prev => ({ ...prev, error: { kind: 'parse-error', message }, isLoading: false }));
            }
        };

        // Debounce the immediate fetch on selection change so rapid arrow-key
        // navigation doesn't fire a synchronous getConversation() per keystroke.
        const debounceHandle = setTimeout(fetchOnce, SELECTION_DEBOUNCE_MS);

        if (paused) {
            return () => {
                mountedRef.current = false;
                clearTimeout(debounceHandle);
            };
        }

        const intervalHandle = setInterval(fetchOnce, intervalMs);
        return () => {
            mountedRef.current = false;
            clearTimeout(debounceHandle);
            clearInterval(intervalHandle);
        };
    }, [manager, agent?.name, agent?.type, agent?.sessionFilePath, intervalMs, tail, paused]);

    return state;
}
