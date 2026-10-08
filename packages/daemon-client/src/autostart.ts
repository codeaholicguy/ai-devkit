import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { DaemonClient, daemonSocketPath } from "./client.js";
import { resolveDaemonBinary } from "./binary.js";

/**
 * tmux-style implicit spawn: if the socket answers, return a client; if not,
 * spawn the daemon (single-spawner guarded by an exclusive lockfile) and wait
 * for readiness. Returns null when no binary exists or spawn fails — callers
 * degrade to today's code paths.
 */
export async function ensureDaemon(opts: { waitMs?: number } = {}): Promise<DaemonClient | null> {
  const waitMs = opts.waitMs ?? 3000;
  // Test runs must never spawn a real daemon. Callers that want to exercise
  // autostart do so by pointing AI_DEVKITD_BIN at a real binary in an explicit
  // integration test — the env below is checked there too via VITEST_SKIP.
  if (process.env.AI_DEVKIT_NO_DAEMON) return null;
  const existing = await DaemonClient.tryConnect();
  if (existing) return existing;
  if (process.env.VITEST && !process.env.AI_DEVKITD_BIN) return null;

  const bin = resolveDaemonBinary();
  if (!bin) return null;

  const sockPath = daemonSocketPath();
  const dir = path.dirname(sockPath);
  fs.mkdirSync(dir, { recursive: true });

  // Single-spawner lockfile: O_EXCL create serializes concurrent starters, and
  // the holder unlinks it when done. A stale lock (crashed spawner) is reclaimed
  // after STALE_LOCK_MS so a dead starter can't wedge autostart forever.
  const STALE_LOCK_MS = 30_000;
  const lockPath = `${sockPath}.spawn.lock`;
  const acquired = acquireSpawnLock(lockPath, STALE_LOCK_MS);
  if (!acquired) {
    // Another process is spawning; just wait for the socket.
    return waitForSocket(waitMs);
  }

  try {
    const logFd = fs.openSync(path.join(dir, "daemon.log"), "a");
    const child = spawn(bin, ["serve"], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    child.unref();
    fs.closeSync(logFd);
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* already gone */
    }
  }
  return waitForSocket(waitMs);
}

function acquireSpawnLock(lockPath: string, staleMs: number): boolean {
  try {
    fs.closeSync(fs.openSync(lockPath, "wx", 0o600));
    return true;
  } catch {
    // Lock held — reclaim it only if the holder plausibly died.
    try {
      const age = Date.now() - fs.statSync(lockPath).mtimeMs;
      if (age > staleMs) {
        fs.unlinkSync(lockPath);
        fs.closeSync(fs.openSync(lockPath, "wx", 0o600));
        return true;
      }
    } catch {
      /* races with the holder are fine — losing means we wait */
    }
    return false;
  }
}

async function waitForSocket(waitMs: number): Promise<DaemonClient | null> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const client = await DaemonClient.tryConnect();
    if (client) return client;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}
