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
  // autostart do so by pointing DEVKITD_BIN at a real binary in an explicit
  // integration test — the env below is checked there too via VITEST_SKIP.
  if (process.env.AI_DEVKIT_NO_DAEMON) return null;
  const existing = await DaemonClient.tryConnect();
  if (existing) return existing;
  if (process.env.VITEST && !process.env.DEVKITD_BIN && !process.env.AI_DEVKITD_BIN) return null;

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
    const logPath = path.join(dir, "daemon.log");
    capDaemonLog(logPath);
    const logFd = fs.openSync(logPath, "a");
    const child = spawn(bin, ["serve"], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    child.unref();
    fs.closeSync(logFd);
  } catch {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* already gone */
    }
    return null;
  }
  // Hold the lock until the daemon is actually serving: a second caller that
  // arrives while devkitd is still binding its socket must see the lock and
  // wait — releasing early lets it spawn a twin that clobbers the socket path
  // and orphans the first daemon forever.
  try {
    return await waitForSocket(waitMs);
  } finally {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      /* already gone */
    }
  }
}

/** daemon.log is append-only per spawn — rotate to .1 past 1 MiB. */
const MAX_LOG_BYTES = 1 << 20;

function capDaemonLog(logPath: string): void {
  try {
    if (fs.statSync(logPath).size > MAX_LOG_BYTES) {
      fs.renameSync(logPath, `${logPath}.1`);
    }
  } catch {
    /* missing or unwritable — the open() caller surfaces real problems */
  }
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
