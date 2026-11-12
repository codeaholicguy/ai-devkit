import { DaemonClient, ensureDaemon, type DaemonEvent } from "@ai-devkit/daemon-client";
import { createLogger } from "../../../util/debug.js";

const debug = createLogger("console:agent-list");

/**
 * Delays (ms after a start event) for warm-up list refreshes. The daemon only
 * sees process lifecycle, so session-file / status attribution that lands a
 * few seconds after `agent.appeared` would otherwise wait for the 60s
 * fallback poll (#405).
 */
export const WARMUP_REFRESH_DELAYS_MS: readonly number[] = [4_000, 10_000, 25_000];

export function isAgentStartEvent(event: DaemonEvent): boolean {
  return event.kind === "agent.appeared" || event.kind === "agent.started";
}

export interface WarmupRefresher {
  /** (Re)start the warm-up schedule; pending timers from an earlier trigger
   *  are dropped so overlapping events coalesce into one schedule. */
  trigger: () => void;
  cancel: () => void;
}

export function createWarmupRefresher(
  refresh: () => void,
  delaysMs: readonly number[] = WARMUP_REFRESH_DELAYS_MS,
): WarmupRefresher {
  let timers: ReturnType<typeof setTimeout>[] = [];
  const cancel = () => {
    for (const t of timers) clearTimeout(t);
    timers = [];
  };
  const trigger = () => {
    cancel();
    debug("warm-up refresh scheduled at +%sms", delaysMs.join("/+"));
    timers = delaysMs.map((delay) =>
      setTimeout(() => {
        debug("warm-up refresh +%dms", delay);
        refresh();
      }, delay),
    );
  };
  return { trigger, cancel };
}

/**
 * Attach to the daemon event stream so agent lifecycle changes
 * trigger a console refresh. Returns the live client on success (caller owns
 * close()); null when the daemon is absent or subscribe fails — callers then
 * keep interval polling. `onSubscribed` fires once the stream is live so the
 * caller can relax its fallback poll.
 */
export async function attachDaemonRefresh(
  onEvent: (event: DaemonEvent) => void,
  onSubscribed: () => void,
): Promise<DaemonClient | null> {
  const client = await ensureDaemon().catch(() => null);
  if (!client) {
    debug("daemon unreachable; keeping fast list poll");
    return null;
  }
  try {
    // Live only: the console is a UI — replaying the persisted event log
    // (up to 10k frames) would only trigger redundant refreshes.
    await client.subscribe(
      (event) => {
        debug("daemon event %s", event.kind);
        onEvent(event);
      },
      { liveOnly: true },
    );
    debug("subscribed to daemon events; relaxing list poll");
    onSubscribed();
    return client;
  } catch (err) {
    debug(
      "daemon subscribe failed (%s); keeping fast list poll",
      err instanceof Error ? err.message : err,
    );
    client.close();
    return null;
  }
}
