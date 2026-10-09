import { DaemonClient, ensureDaemon } from "@ai-devkit/daemon-client";

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
  if (!client) return null;
  try {
    // Live only: the console is a UI — replaying the persisted event log
    // (up to 10k frames) would only trigger redundant refreshes.
    await client.subscribe(() => onEvent(), { liveOnly: true });
    onSubscribed();
    return client;
  } catch {
    client.close();
    return null;
  }
}
