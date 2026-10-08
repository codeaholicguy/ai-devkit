import { describe, it, expect, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DaemonClient } from "../client.js";
import { ensureDaemon } from "../autostart.js";

const missing = path.join(os.tmpdir(), `no-such-daemon-${process.pid}.sock`);

describe("socket fallback", () => {
  it("tryConnect returns null when the socket does not exist", async () => {
    expect(await DaemonClient.tryConnect(missing)).toBeNull();
  });

  it("connect rejects on a missing socket", async () => {
    await expect(DaemonClient.connect(missing)).rejects.toThrow();
  });
});

// Autostart against the real binary when available (dev box sets
// DEVKITD_BIN, or rust/target/{release,debug} exists). Skipped otherwise.
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const devBin = [
  path.join(repoRoot, "rust/target/release/devkitd"),
  path.join(repoRoot, "rust/target/debug/devkitd"),
].find((p) => fs.existsSync(p));
const bin = process.env.DEVKITD_BIN ?? process.env.AI_DEVKITD_BIN ?? devBin;
const sock = path.join(os.homedir(), ".ai-devkit", "daemon.sock");

describe.runIf(bin != null)("ensureDaemon (real binary)", () => {
  const spawned = bin!;
  const previousBin = process.env.DEVKITD_BIN;
  process.env.DEVKITD_BIN = spawned;

  afterAll(async () => {
    if (previousBin === undefined) delete process.env.DEVKITD_BIN;
    else process.env.DEVKITD_BIN = previousBin;
    // Leave the daemon running only if we didn't start it — send shutdown
    // regardless is safer for test machines than leaking a process.
    const c = await DaemonClient.tryConnect();
    if (c) {
      await c.request("shutdown").catch(() => {});
      c.close();
    }
  });

  it("spawns the daemon on socket miss and returns a working client", async () => {
    // If a daemon is already running from dev, this still passes: ensureDaemon
    // short-circuits on a live socket. Either way we get a working client.
    const client = await ensureDaemon({ waitMs: 8000 });
    expect(client).not.toBeNull();
    const pong = (await client!.request("ping")) as { pong: boolean };
    expect(pong.pong).toBe(true);
    const put = await client!.request("registry.put", {
      scope: "test",
      name: "it",
      value: { ok: true },
    });
    expect((put as { ok: boolean }).ok).toBe(true);
    const got = await client!.request("registry.get", {
      scope: "test",
      name: "it",
    });
    expect((got as { ok: boolean }).ok).toBe(true);
    client!.close();
  }, 15000);

  it("a second ensureDaemon is a no-op fast path", async () => {
    const started = Date.now();
    const client = await ensureDaemon();
    expect(client).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
    client!.close();
  });

  it("enrichedAgents returns agents + ported over the real socket", async () => {
    const client = await ensureDaemon({ waitMs: 8000 });
    expect(client).not.toBeNull();
    const result = await client!.enrichedAgents();
    // I0: no harness ported yet — the contract is the shape, not content.
    expect(Array.isArray(result.agents)).toBe(true);
    expect(Array.isArray(result.ported)).toBe(true);
    client!.close();
  }, 15000);
});

describe.runIf(fs.existsSync(sock))("live daemon", () => {
  it("daemon.status reports version and socket", async () => {
    const c = await DaemonClient.tryConnect();
    if (!c) return; // socket file lingered after shutdown — nothing to check
    const s = (await c.request("daemon.status")) as {
      version: string;
      socket: string;
    };
    expect(s.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(s.socket).toBe(sock);
    c.close();
  });
});
