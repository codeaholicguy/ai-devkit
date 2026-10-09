import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentInfo, AgentManager } from "@ai-devkit/agent-manager";
import type { DaemonClient } from "@ai-devkit/daemon-client";
import { attachDaemonRefresh } from "./agentListSubscription.js";

export interface UseAgentListResult {
  agents: AgentInfo[];
  error: string | null;
  lastUpdated: Date | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

type AgentListState = Omit<UseAgentListResult, "refresh">;

export const LIST_POLL_INTERVAL_MS = 3000;
/** Slow safety-net poll once the daemon event stream drives refresh — covers
 *  attribution drift (status text, session files) the daemon can't see. */
export const LIST_FALLBACK_INTERVAL_MS = 60_000;

export function agentsEqual(a: AgentInfo[], b: AgentInfo[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.name !== y.name ||
      Boolean(x.pinned) !== Boolean(y.pinned) ||
      x.status !== y.status ||
      x.type !== y.type ||
      x.summary !== y.summary ||
      x.sessionFilePath !== y.sessionFilePath
    )
      return false;
    const tx =
      x.lastActive instanceof Date ? x.lastActive.getTime() : Date.parse(x.lastActive as string);
    const ty =
      y.lastActive instanceof Date ? y.lastActive.getTime() : Date.parse(y.lastActive as string);
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
  const [state, setState] = useState<AgentListState>({
    agents: [],
    error: null,
    lastUpdated: null,
    isLoading: true,
  });

  const runTokenRef = useRef(0);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const token = ++runTokenRef.current;
    try {
      const next = await manager.listAgents({ sortBy: "status" });
      if (!mountedRef.current || token !== runTokenRef.current) return;
      setState((prev) => {
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
      setState((prev) =>
        prev.error === message && !prev.isLoading
          ? prev
          : { ...prev, error: message, isLoading: false },
      );
    } finally {
      inFlightRef.current = false;
    }
  }, [manager]);

  useEffect(() => {
    mountedRef.current = true;
    inFlightRef.current = false;

    if (paused) {
      return () => {
        mountedRef.current = false;
      };
    }
    void refresh();
    let handle = setInterval(() => {
      void refresh();
    }, intervalMs);

    // Daemon event stream → immediate refresh on agent lifecycle
    // changes; on success the blind poll relaxes to the slow fallback. Any
    // failure leaves today's interval behavior untouched. If the stream
    // dies mid-session (daemon restart) the fast poll resumes and the
    // attach is retried — otherwise the console would silently stay on
    // the 60s fallback for the rest of its life.
    let client: DaemonClient | null = null;
    let disposed = false;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    const fastPoll = () => {
      clearInterval(handle);
      handle = setInterval(() => {
        void refresh();
      }, intervalMs);
    };
    const attach = async (): Promise<void> => {
      const c = await attachDaemonRefresh(
        () => void refresh(),
        () => {
          if (disposed) return;
          clearInterval(handle);
          handle = setInterval(() => {
            void refresh();
          }, LIST_FALLBACK_INTERVAL_MS);
        },
      );
      if (disposed) {
        c?.close();
        return;
      }
      client = c;
      if (c) {
        c.onDisconnect = () => {
          client = null;
          fastPoll();
          reconnect = setTimeout(() => {
            if (!disposed) void attach();
          }, 2000);
        };
      }
    };
    void attach();

    return () => {
      disposed = true;
      mountedRef.current = false;
      clearInterval(handle);
      if (reconnect) clearTimeout(reconnect);
      client?.close();
    };
  }, [intervalMs, paused, refresh]);

  return { ...state, refresh };
}
