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

export function messagesEqual(a: ConversationMessage[], b: ConversationMessage[]): boolean {
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

interface CacheEntry {
    mtime: number;
    messages: ConversationMessage[];
}

export const CACHE_MAX = 50;
// Module-level LRU cache: re-inserting a key moves it to most-recent position.
export const conversationCache = new Map<string, CacheEntry>();

export function cacheSet(key: string, entry: CacheEntry): void {
    conversationCache.delete(key);
    if (conversationCache.size >= CACHE_MAX) {
        conversationCache.delete(conversationCache.keys().next().value!);
    }
    conversationCache.set(key, entry);
}

export class ConversationRequestGate {
    private currentToken = 0;

    begin(): number {
        return ++this.currentToken;
    }

    invalidate(): void {
        this.currentToken++;
    }

    isCurrent(token: number): boolean {
        return token === this.currentToken;
    }
}

export async function loadAgentConversation(
    manager: AgentManager,
    agent: AgentInfo,
    tail: number,
    gate: ConversationRequestGate,
    token: number,
): Promise<UseAgentConversationResult | null> {
    if (!agent.sessionFilePath) {
        return gate.isCurrent(token) ? {
            messages: [],
            error: { kind: 'no-session-file', message: `No session file for "${agent.name}".` },
            lastUpdated: null,
            isLoading: false,
        } : null;
    }

    if (!manager.getAdapter(agent.type)) {
        return gate.isCurrent(token) ? {
            messages: [],
            error: { kind: 'no-adapter', message: `Unsupported agent type: ${agent.type}` },
            lastUpdated: null,
            isLoading: false,
        } : null;
    }

    try {
        const result = await manager.getConversationTail(agent.type, agent.sessionFilePath, {
            verbose: false,
            limit: tail,
        });
        if (!gate.isCurrent(token)) return null;
        const messages = tail > 0 && result.messages.length > tail
            ? result.messages.slice(-tail)
            : result.messages;
        return { messages, error: null, lastUpdated: new Date(), isLoading: false };
    } catch (error) {
        if (!gate.isCurrent(token)) return null;
        return {
            messages: [],
            error: {
                kind: 'parse-error',
                message: error instanceof Error ? error.message : String(error),
            },
            lastUpdated: null,
            isLoading: false,
        };
    }
}

export function startConversationPolling(
    fetchOnce: () => Promise<void>,
    intervalMs: number,
): ReturnType<typeof setInterval> {
    return setInterval(() => { void fetchOnce(); }, intervalMs);
}

export function useAgentConversation({
    manager,
    agent,
    intervalMs = PREVIEW_POLL_INTERVAL_MS,
    tail = PREVIEW_TAIL,
    paused = false,
}: Params): UseAgentConversationResult {
    const [state, setState] = useState<UseAgentConversationResult>(EMPTY_STATE);

    const gateRef = useRef(new ConversationRequestGate());
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;

        if (!agent) {
            setState(prev => prev === EMPTY_STATE ? prev : EMPTY_STATE);
            return () => {
                mountedRef.current = false;
                gateRef.current.invalidate();
            };
        }

        // If we have a cached result for this agent, show it immediately while
        // the debounced fetch confirms whether the file has changed.
        const cached = agent.sessionFilePath ? conversationCache.get(agent.sessionFilePath) : undefined;
        setState(cached
            ? { messages: cached.messages, error: null, lastUpdated: new Date(), isLoading: false }
            : { messages: [], error: null, lastUpdated: null, isLoading: true },
        );

        let inFlight = false;
        const fetchOnce = async (): Promise<void> => {
            if (inFlight) return;
            inFlight = true;
            const token = gateRef.current.begin();
            try {
                const result = await loadAgentConversation(manager, agent, tail, gateRef.current, token);
                if (!result || !mountedRef.current) return;

                if (result.error) {
                    setState(prev => ({
                        ...prev,
                        error: result.error,
                        lastUpdated: prev.lastUpdated,
                        isLoading: false,
                    }));
                    return;
                }

                if (agent.sessionFilePath) {
                    cacheSet(agent.sessionFilePath, { mtime: Date.now(), messages: result.messages });
                }
                setState(prev => {
                    const changed = !messagesEqual(prev.messages, result.messages);
                    if (!changed && prev.error === null && !prev.isLoading && prev.lastUpdated !== null) return prev;
                    return {
                        messages: changed ? result.messages : prev.messages,
                        error: null,
                        lastUpdated: result.lastUpdated,
                        isLoading: false,
                    };
                });
            } finally {
                inFlight = false;
            }
        };

        // Debounce the immediate fetch on selection change so rapid arrow-key
        // navigation doesn't fire a synchronous getConversation() per keystroke.
        const debounceHandle = setTimeout(() => { void fetchOnce(); }, SELECTION_DEBOUNCE_MS);

        if (paused) {
            return () => {
                mountedRef.current = false;
                gateRef.current.invalidate();
                clearTimeout(debounceHandle);
            };
        }

        const intervalHandle = startConversationPolling(fetchOnce, intervalMs);
        return () => {
            mountedRef.current = false;
            gateRef.current.invalidate();
            clearTimeout(debounceHandle);
            clearInterval(intervalHandle);
        };
    }, [manager, agent?.name, agent?.type, agent?.sessionFilePath, intervalMs, tail, paused]);

    return state;
}
