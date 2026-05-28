import { useEffect, useRef, useState } from 'react';
import type { AgentInfo, AgentManager } from '@ai-devkit/agent-manager';

export interface UseAgentListResult {
    agents: AgentInfo[];
    error: string | null;
    lastUpdated: Date | null;
    isLoading: boolean;
}

export const LIST_POLL_INTERVAL_MS = 3000;

export function agentsEqual(a: AgentInfo[], b: AgentInfo[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (
            x.name !== y.name
            || x.status !== y.status
            || x.type !== y.type
            || x.summary !== y.summary
            || x.sessionFilePath !== y.sessionFilePath
        ) return false;
        const tx = x.lastActive instanceof Date ? x.lastActive.getTime() : Date.parse(x.lastActive as string);
        const ty = y.lastActive instanceof Date ? y.lastActive.getTime() : Date.parse(y.lastActive as string);
        if (tx !== ty) return false;
    }
    return true;
}

export function useAgentList(
    manager: AgentManager,
    intervalMs: number = LIST_POLL_INTERVAL_MS,
    paused: boolean = false,
): UseAgentListResult {
    // Single state object so multiple updates within one fetch produce
    // exactly one render (React 17 doesn't batch async setState).
    const [state, setState] = useState<UseAgentListResult>({
        agents: [],
        error: null,
        lastUpdated: null,
        isLoading: true,
    });

    const runTokenRef = useRef(0);
    const inFlightRef = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        inFlightRef.current = false;

        const fetchOnce = async (): Promise<void> => {
            if (inFlightRef.current) return;
            inFlightRef.current = true;
            const token = ++runTokenRef.current;
            try {
                const next = await manager.listAgents({ sortBy: 'status' });
                if (!mountedRef.current || token !== runTokenRef.current) return;
                setState(prev => {
                    const isFirst = prev.lastUpdated === null;
                    const changed = !agentsEqual(prev.agents, next);
                    // Quiet poll: nothing changed, no error to clear, not first
                    // load. Skip state update entirely → zero re-renders.
                    if (!changed && prev.error === null && !prev.isLoading && !isFirst) {
                        return prev;
                    }
                    return {
                        agents: changed ? next : prev.agents,
                        error: null,
                        lastUpdated: new Date(),
                        isLoading: false,
                    };
                });
            } catch (err) {
                if (!mountedRef.current || token !== runTokenRef.current) return;
                const message = err instanceof Error ? err.message : String(err);
                setState(prev => prev.error === message && !prev.isLoading
                    ? prev
                    : { ...prev, error: message, isLoading: false });
            } finally {
                inFlightRef.current = false;
            }
        };

        if (paused) {
            return () => { mountedRef.current = false; };
        }
        void fetchOnce();
        const handle = setInterval(() => { void fetchOnce(); }, intervalMs);

        return () => {
            mountedRef.current = false;
            clearInterval(handle);
        };
    }, [manager, intervalMs, paused]);

    return state;
}
