import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { DaemonClient, daemonSocketPath } from "./client.js";
import { readBinaryBuildVersion, resolveDaemonBinaryInfo, type DaemonBinary } from "./binary.js";

/** A crashed spawner's lock is reclaimed after this long. */
const STALE_LOCK_MS = 30_000;

/**
 * tmux-style implicit spawn: if the socket answers, return a client; if not,
 * spawn the daemon (single-spawner guarded by an exclusive lockfile) and wait
 * for readiness. Returns null when no binary exists or spawn fails — callers
 * degrade to today's code paths.
 *
 * A live daemon older than the bundled platform package is replaced (#376);
 * see staleDaemonBinary for the rule.
 */
export async function ensureDaemon(
  opts: {
    waitMs?: number;
    onDebug?: (msg: string) => void;
    /** Test seam — defaults to resolveDaemonBinaryInfo. */
    resolveBinary?: (onDebug?: (msg: string) => void) => DaemonBinary | null;
  } = {},
): Promise<DaemonClient | null> {
  const waitMs = opts.waitMs ?? 3000;
  const debug = opts.onDebug;
  const resolveBinary = opts.resolveBinary ?? resolveDaemonBinaryInfo;
  // Test runs must never spawn a real daemon. Callers that want to exercise
  // autostart do so by pointing DEVKITD_BIN at a real binary in an explicit
  // integration test — the env below is checked there too via VITEST_SKIP.
  if (process.env.AI_DEVKIT_NO_DAEMON) {
    debug?.("daemon path disabled (AI_DEVKIT_NO_DAEMON set)");
    return null;
  }
  const spawnSkipped = () =>
    !!process.env.VITEST && !process.env.DEVKITD_BIN && !process.env.AI_DEVKITD_BIN;
  const existing = await DaemonClient.tryConnect();
  if (existing) {
    debug?.(`connected to live daemon at ${daemonSocketPath()}`);
    const bin = await staleDaemonBinary(existing, resolveBinary(debug), debug);
    if (!bin || spawnSkipped()) return existing;
    existing.close();
    return replaceStaleDaemon(bin, waitMs, debug);
  }
  debug?.("no live daemon on socket; attempting autostart");
  if (spawnSkipped()) {
    debug?.("autostart skipped in test env (VITEST set, no DEVKITD_BIN)");
    return null;
  }

  const bin = resolveBinary(debug);
  if (!bin) {
    debug?.("no devkitd binary; daemon path unavailable");
    return null;
  }

  const sockPath = daemonSocketPath();
  const dir = path.dirname(sockPath);
  fs.mkdirSync(dir, { recursive: true });

  // Single-spawner lockfile: O_EXCL create serializes concurrent starters, and
  // the holder unlinks it when done. A stale lock (crashed spawner) is reclaimed
  // after STALE_LOCK_MS so a dead starter can't wedge autostart forever.
  const lockPath = `${sockPath}.spawn.lock`;
  const acquired = acquireSpawnLock(lockPath, STALE_LOCK_MS);
  if (!acquired) {
    // Another process is spawning; just wait for the socket.
    debug?.("another process is spawning devkitd; waiting for socket");
    return waitForSocket(waitMs, debug);
  }

  // Hold the lock until the daemon is actually serving: a second caller that
  // arrives while devkitd is still binding its socket must see the lock and
  // wait — releasing early lets it spawn a twin that clobbers the socket path
  // and orphans the first daemon forever.
  try {
    if (!spawnDaemon(bin.path, dir, debug)) return null;
    return await waitForSocket(waitMs, debug);
  } finally {
    releaseSpawnLock(lockPath);
  }
}

/**
 * Decide whether the live daemon should be replaced by `bin`; returns the
 * binary to spawn, or null to keep the live daemon. The rule:
 *
 *  - No package version for the bundled binary (env override, ~/.ai-devkit/bin,
 *    dev checkout) → keep. Only platform-package installs know which release
 *    they expect.
 *  - Live `buildVersion` equals the package version → keep.
 *  - Live `buildVersion` is semver-newer → keep. A newer CLI started it and
 *    downgrading would make the two CLIs fight over the socket; older
 *    clients already fall back on `unknown method`.
 *  - Older, missing (pre-#376 daemon or unstamped build), or `daemon.status`
 *    unknown → stale, but only if the bundled binary itself reports the
 *    package version. Otherwise the respawn would mismatch again and every
 *    invocation would restart it.
 *  - `daemon.status` failing any other way (timeout, socket error) → keep:
 *    daemon-first, never kill what we can't identify.
 */
async function staleDaemonBinary(
  client: DaemonClient,
  bin: DaemonBinary | null,
  debug?: (msg: string) => void,
): Promise<DaemonBinary | null> {
  if (!bin?.version) {
    debug?.("daemon version check skipped (bundled devkitd has no package version)");
    return null;
  }
  let running: string | null = null;
  try {
    const status = (await client.request("daemon.status", {}, 1500)) as {
      buildVersion?: unknown;
    } | null;
    if (typeof status?.buildVersion === "string") running = status.buildVersion;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.startsWith("unknown method")) {
      debug?.(`daemon.status failed (${msg}); keeping live daemon`);
      return null;
    }
  }
  if (running === bin.version) {
    debug?.(`live devkitd ${running} matches bundled package`);
    return null;
  }
  if (running && (compareVersions(running, bin.version) ?? 0) > 0) {
    debug?.(`live devkitd ${running} is newer than bundled ${bin.version}; keeping it`);
    return null;
  }
  const label = running ?? "without build version";
  const self = readBinaryBuildVersion(bin.path);
  if (self !== bin.version) {
    debug?.(
      `stale devkitd ${label}, but bundled binary reports ${self ?? "no build version"} ` +
        `(package ${bin.version}); not replacing`,
    );
    return null;
  }
  debug?.(`stale devkitd ${label} on socket; replacing with bundled ${bin.version}`);
  return bin;
}

/**
 * Graceful replacement under the spawn lock: re-check (a concurrent CLI may
 * have replaced it already), request `shutdown`, wait for the socket to go
 * dead, then spawn the bundled binary. A daemon that won't exit is kept —
 * never two daemons, never a dead socket.
 */
async function replaceStaleDaemon(
  bin: DaemonBinary,
  waitMs: number,
  debug?: (msg: string) => void,
): Promise<DaemonClient | null> {
  const sockPath = daemonSocketPath();
  const dir = path.dirname(sockPath);
  fs.mkdirSync(dir, { recursive: true });
  const lockPath = `${sockPath}.spawn.lock`;
  if (!acquireSpawnLock(lockPath, STALE_LOCK_MS)) {
    // The holder may need waitMs to stop the old daemon plus waitMs to spawn.
    debug?.("another process is replacing devkitd; waiting for it");
    return waitForLockRelease(lockPath, 2 * waitMs + 1000, debug);
  }
  try {
    const current = await DaemonClient.tryConnect();
    if (current) {
      if (!(await staleDaemonBinary(current, bin, debug))) return current;
      await current.request("shutdown", {}, 1000).catch(() => {});
      current.close();
      if (!(await waitForSocketDead(waitMs))) {
        debug?.("stale devkitd did not exit; continuing with it");
        return DaemonClient.tryConnect();
      }
      debug?.("stale devkitd stopped");
    }
    if (!spawnDaemon(bin.path, dir, debug)) return null;
    return await waitForSocket(waitMs, debug);
  } finally {
    releaseSpawnLock(lockPath);
  }
}

/** Numeric x.y.z compare; null when either side isn't a release version. */
function compareVersions(a: string, b: string): number | null {
  const parse = (v: string) => /^(\d+)\.(\d+)\.(\d+)/.exec(v)?.slice(1).map(Number);
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
  return 0;
}

function spawnDaemon(bin: string, dir: string, debug?: (msg: string) => void): boolean {
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
    debug?.(`spawned devkitd (pid ${child.pid}) from ${bin}; waiting for socket`);
    return true;
  } catch {
    debug?.("devkitd spawn failed");
    return false;
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

function releaseSpawnLock(lockPath: string): void {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* already gone */
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

async function waitForSocket(
  waitMs: number,
  debug?: (msg: string) => void,
): Promise<DaemonClient | null> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const client = await DaemonClient.tryConnect();
    if (client) {
      debug?.("devkitd socket ready");
      return client;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  debug?.(`timed out after ${waitMs}ms waiting for devkitd socket`);
  return null;
}

async function waitForSocketDead(waitMs: number): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const client = await DaemonClient.tryConnect();
    if (!client) return true;
    client.close();
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

async function waitForLockRelease(
  lockPath: string,
  waitMs: number,
  debug?: (msg: string) => void,
): Promise<DaemonClient | null> {
  const deadline = Date.now() + waitMs;
  while (fs.existsSync(lockPath) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const client = await DaemonClient.tryConnect();
  debug?.(client ? "devkitd socket ready" : "no devkitd after waiting for replacement");
  return client;
}
