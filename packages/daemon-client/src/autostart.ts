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
  const existing = await DaemonClient.tryConnect();
  if (existing) return existing;

  const bin = resolveDaemonBinary();
  if (!bin) return null;

  const sockPath = daemonSocketPath();
  const dir = path.dirname(sockPath);
  fs.mkdirSync(dir, { recursive: true });

  // flock-guarded single spawn: O_EXCL lockfile serializes concurrent starters.
  const lockPath = `${sockPath}.spawn.lock`;
  let lockFd: number;
  try {
    lockFd = fs.openSync(lockPath, "wx", 0o600);
    fs.closeSync(lockFd);
  } catch {
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
  }
  return waitForSocket(waitMs);
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
