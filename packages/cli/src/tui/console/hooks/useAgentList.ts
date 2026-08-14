import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AgentStatus,
    type AgentInfo,
    type AgentManager,
    type CachedAgentSnapshot,
} from '@ai-devkit/agent-manager';

export interface UseAgentListResult {
    agents: AgentInfo[];
    error: string | null;
    lastUpdated: Date | null;
    isLoading: boolean;
    isRefreshing: boolean;
    cachedAgentPids: ReadonlySet<number>;
    refresh: () => Promise<void>;
}

type AgentListState = Omit<UseAgentListResult, 'refresh'>;

export const LIST_POLL_INTERVAL_MS = 3000;

function cachedAgentToPlaceholder(snapshot: CachedAgentSnapshot): AgentInfo {
    return {
        name: snapshot.name,
        type: snapshot.type,
        status: AgentStatus.UNKNOWN,
        summary: '',
        pid: snapshot.pid,
        projectPath: snapshot.projectPath,
        sessionId: snapshot.sessionId,
        lastActive: snapshot.startedAt,
        sessionFilePath: snapshot.sessionFilePath,
    };
}

function createInitialState(manager: AgentManager): AgentListState {
    const snapshot = manager.getCachedAgentSnapshot();
    const agents = snapshot
        .map(cachedAgentToPlaceholder)
        .sort((left, right) => left.name.localeCompare(right.name));
    return {
        agents,
        error: null,
        lastUpdated: null,
        isLoading: true,
        isRefreshing: true,
        cachedAgentPids: new Set(snapshot.map(agent => agent.pid)),
    };
}

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
    const [state, setState] = useState<AgentListState>(() => createInitialState(manager));

    const runTokenRef = useRef(0);
    const inFlightRef = useRef(false);
    const mountedRef = useRef(true);

    const refresh = useCallback(async (): Promise<void> => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        if (mountedRef.current) {
            setState(prev => prev.cachedAgentPids.size > 0 && !prev.isRefreshing
                ? { ...prev, isRefreshing: true }
                : prev);
        }
        const token = ++runTokenRef.current;
        try {
            const next = await manager.listAgents({ sortBy: 'status' });
            if (!mountedRef.current || token !== runTokenRef.current) return;
            setState(prev => {
                const isFirst = prev.lastUpdated === null;
                const changed = !agentsEqual(prev.agents, next);
                const wasCached = prev.cachedAgentPids.size > 0;
                // Quiet poll: nothing changed, no error to clear, not first
                // load. Skip state update entirely → zero re-renders.
                if (!changed && !wasCached && prev.error === null && !prev.isLoading && !isFirst) {
                    return prev;
                }
                return {
                    agents: changed || wasCached ? next : prev.agents,
                    error: null,
                    lastUpdated: new Date(),
                    isLoading: false,
                    isRefreshing: false,
                    cachedAgentPids: new Set<number>(),
                };
            });
        } catch (err) {
            if (!mountedRef.current || token !== runTokenRef.current) return;
            const message = err instanceof Error ? err.message : String(err);
            setState(prev => prev.error === message && !prev.isLoading && !prev.isRefreshing
                ? prev
                : { ...prev, error: message, isLoading: false, isRefreshing: false });
        } finally {
            inFlightRef.current = false;
        }
    }, [manager]);

    useEffect(() => {
        mountedRef.current = true;
        inFlightRef.current = false;

        if (paused) {
            return () => { mountedRef.current = false; };
        }
        void refresh();
        const handle = setInterval(() => { void refresh(); }, intervalMs);

        return () => {
            mountedRef.current = false;
            clearInterval(handle);
        };
    }, [intervalMs, paused, refresh]);

    return { ...state, refresh };
}
