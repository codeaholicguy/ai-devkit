import { DaemonClient, ensureDaemon } from "@ai-devkit/daemon-client";
import { createLogger } from "../../../util/debug.js";

const debug = createLogger("console:agent-list");

/**
 * Attach to the daemon event stream so agent lifecycle changes
 * trigger a console refresh. Returns the live client on success (caller owns
 * close()); null when the daemon is absent or subscribe fails — callers then
 * keep interval polling. `onSubscribed` fires once the stream is live so the
 * caller can relax its fallback poll.
 */
export async function attachDaemonRefresh(
  onEvent: () => void,
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
        onEvent();
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
