import { DaemonClient, ensureDaemon } from "@ai-devkit/daemon-client";

/**
 * Attach to the daemon event stream so agent lifecycle/registry changes
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
    await client.subscribe(() => onEvent());
    onSubscribed();
    return client;
  } catch {
    client.close();
    return null;
  }
}
