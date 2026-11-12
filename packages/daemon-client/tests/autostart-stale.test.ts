import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { DaemonClient, daemonSocketPath } from "../src/client.js";
import { ensureDaemon } from "../src/autostart.js";
import type { DaemonBinary } from "../src/binary.js";

// Stale-daemon replacement (#376). Every daemon here is a fake devkitd
// script serving an isolated HOME — the real ~/.ai-devkit socket is never
// touched, and only pids these tests spawned are ever killed.

interface FakeOpts {
  /** daemon.status.buildVersion; undefined = pre-#376 daemon (key absent). */
  buildVersion?: string | null;
  /** Answer daemon.status with "unknown method" (pre-status daemon). */
  noStatus?: boolean;
  /** Acknowledge shutdown but keep serving (wedged/old daemon). */
  ignoreShutdown?: boolean;
  /** What `devkitd version` prints; defaults to buildVersion. */
  selfReported?: string | null;
}

function makeFakeBin(dir: string, name: string, opts: FakeOpts): string {
  const file = path.join(dir, name);
  const status: Record<string, unknown> = { version: "0.1.0" };
  if (opts.buildVersion !== undefined) status.buildVersion = opts.buildVersion;
  const selfReported = opts.selfReported !== undefined ? opts.selfReported : opts.buildVersion;
  fs.writeFileSync(
    file,
    `#!/usr/bin/env node
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const os = require("node:os");
const STATUS = ${JSON.stringify(status)};
if (process.argv[2] === "version") {
  console.log(JSON.stringify({ version: "0.1.0", buildVersion: ${JSON.stringify(selfReported ?? null)} }));
  process.exit(0);
}
const dir = path.join(os.homedir(), ".ai-devkit");
const sock = path.join(dir, "daemon.sock");
fs.mkdirSync(dir, { recursive: true });
fs.appendFileSync(path.join(dir, "fake-pids"), process.pid + "\\n");
const serve = () => {
  const server = net.createServer((conn) => {
    let buf = "";
    conn.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\\n")) >= 0) {
        const req = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        const reply = (o) => conn.write(JSON.stringify({ id: req.id, ...o }) + "\\n");
        if (req.method === "ping") reply({ result: { pong: true } });
        else if (req.method === "daemon.status" && !${!!opts.noStatus})
          reply({ result: { ...STATUS, pid: process.pid } });
        else if (req.method === "shutdown") {
          reply({ result: { ok: true } });
          // Like devkitd: exit without unlinking the socket file.
          if (!${!!opts.ignoreShutdown}) setTimeout(() => process.exit(0), 20);
        } else reply({ error: "unknown method: " + req.method });
      }
    });
  });
  server.listen(sock);
};
// Like devkitd: refuse a live socket, unlink a dead one.
const probe = net.createConnection(sock);
probe.on("connect", () => { console.error("devkitd already running"); process.exit(1); });
probe.on("error", () => { try { fs.unlinkSync(sock); } catch {} serve(); });
`,
  );
  fs.chmodSync(file, 0o755);
  return file;
}

async function startDaemon(bin: string): Promise<void> {
  const child = spawn(bin, ["serve"], { detached: true, stdio: "ignore" });
  child.unref();
  for (let i = 0; i < 100; i++) {
    const c = await DaemonClient.tryConnect();
    if (c) {
      c.close();
      return;
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("fake daemon did not come up");
}

async function liveStatus(): Promise<Record<string, unknown>> {
  const c = await DaemonClient.tryConnect();
  if (!c) throw new Error("no daemon");
  try {
    return (await c.request("daemon.status")) as Record<string, unknown>;
  } finally {
    c.close();
  }
}

describe("ensureDaemon stale-daemon replacement", () => {
  let home: string;
  let binDir: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "aidk-stale-home-"));
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidk-stale-bin-"));
    for (const k of ["HOME", "DEVKITD_BIN", "AI_DEVKIT_NO_DAEMON"]) saved[k] = process.env[k];
    process.env.HOME = home;
    delete process.env.AI_DEVKIT_NO_DAEMON;
  });

  afterEach(() => {
    const pids = path.join(home, ".ai-devkit", "fake-pids");
    if (fs.existsSync(pids)) {
      for (const pid of fs.readFileSync(pids, "utf8").split("\n").filter(Boolean)) {
        try {
          process.kill(Number(pid), "SIGKILL");
        } catch {
          /* already exited */
        }
      }
    }
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  });

  /** Bundled binary at `version`, resolved as if from the platform package. */
  function bundled(version: string, opts: FakeOpts = {}): () => DaemonBinary {
    const file = makeFakeBin(binDir, "devkitd-current", { buildVersion: version, ...opts });
    process.env.DEVKITD_BIN = file;
    return () => ({ path: file, version });
  }

  it("keeps a daemon whose build matches the bundled package", async () => {
    const resolveBinary = bundled("0.2.2");
    await startDaemon(makeFakeBin(binDir, "same", { buildVersion: "0.2.2" }));
    const before = await liveStatus();
    const client = await ensureDaemon({ resolveBinary });
    expect(client).not.toBeNull();
    client!.close();
    expect((await liveStatus()).pid).toBe(before.pid);
  });

  it.each<[string, FakeOpts]>([
    ["an older daemon", { buildVersion: "0.2.1" }],
    ["a pre-#376 daemon that reports no build version", {}],
    ["a daemon that does not know daemon.status", { noStatus: true }],
  ])(
    "replaces %s with the bundled build",
    async (_label, fake) => {
      const resolveBinary = bundled("0.2.2");
      await startDaemon(makeFakeBin(binDir, "stale", fake));
      const client = await ensureDaemon({ resolveBinary });
      expect(client).not.toBeNull();
      client!.close();
      expect((await liveStatus()).buildVersion).toBe("0.2.2");
    },
    15000,
  );

  it("keeps a newer daemon started by a newer CLI", async () => {
    const resolveBinary = bundled("0.2.2");
    await startDaemon(makeFakeBin(binDir, "newer", { buildVersion: "0.3.0" }));
    const traces: string[] = [];
    const client = await ensureDaemon({ resolveBinary, onDebug: (m) => traces.push(m) });
    expect(client).not.toBeNull();
    client!.close();
    expect((await liveStatus()).buildVersion).toBe("0.3.0");
    expect(traces.join("\n")).toMatch(/newer/);
  });

  it("does not restart when the bundled binary itself reports another build (loop guard)", async () => {
    // Package says 0.2.2 but the binary inside reports 0.2.1 — replacing
    // would respawn the same mismatch on every invocation.
    const resolveBinary = bundled("0.2.2", { selfReported: "0.2.1" });
    await startDaemon(makeFakeBin(binDir, "old", { buildVersion: "0.2.1" }));
    const before = await liveStatus();
    const traces: string[] = [];
    const client = await ensureDaemon({ resolveBinary, onDebug: (m) => traces.push(m) });
    expect(client).not.toBeNull();
    client!.close();
    expect((await liveStatus()).pid).toBe(before.pid);
    expect(traces.join("\n")).toMatch(/not replacing/);
  });

  it("skips the version check when the binary has no package version", async () => {
    const file = makeFakeBin(binDir, "devkitd-dev", { buildVersion: null });
    process.env.DEVKITD_BIN = file;
    await startDaemon(makeFakeBin(binDir, "old", { buildVersion: "0.2.1" }));
    const before = await liveStatus();
    const client = await ensureDaemon({
      resolveBinary: () => ({ path: file }),
    });
    expect(client).not.toBeNull();
    client!.close();
    expect((await liveStatus()).pid).toBe(before.pid);
  });

  it("falls back to the stale daemon when it will not shut down", async () => {
    const resolveBinary = bundled("0.2.2");
    await startDaemon(
      makeFakeBin(binDir, "stuck", { buildVersion: "0.2.1", ignoreShutdown: true }),
    );
    const before = await liveStatus();
    const client = await ensureDaemon({ resolveBinary, waitMs: 500 });
    expect(client).not.toBeNull();
    client!.close();
    expect((await liveStatus()).pid).toBe(before.pid);
    expect(fs.existsSync(`${daemonSocketPath()}.spawn.lock`)).toBe(false);
  }, 15000);

  it("concurrent callers converge on one replacement daemon", async () => {
    const resolveBinary = bundled("0.2.2");
    await startDaemon(makeFakeBin(binDir, "old", { buildVersion: "0.2.1" }));
    const clients = await Promise.all([
      ensureDaemon({ resolveBinary }),
      ensureDaemon({ resolveBinary }),
      ensureDaemon({ resolveBinary }),
    ]);
    const pids = new Set<unknown>();
    for (const c of clients) {
      expect(c).not.toBeNull();
      const s = (await c!.request("daemon.status")) as Record<string, unknown>;
      expect(s.buildVersion).toBe("0.2.2");
      pids.add(s.pid);
      c!.close();
    }
    expect(pids.size).toBe(1);
  }, 20000);
});
