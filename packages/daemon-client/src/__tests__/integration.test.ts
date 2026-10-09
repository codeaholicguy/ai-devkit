import { describe, it, expect, afterAll } from "vitest";
import * as fs from "node:fs";
import * as net from "node:net";
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

describe("socket teardown", () => {
  /** Serve requests for everything except `hang`, which kills the conn. */
  async function fakeDaemon(): Promise<{ sock: string; server: net.Server }> {
    const sock = path.join(os.tmpdir(), `fake-daemon-${process.pid}-${Date.now()}.sock`);
    const server = net.createServer((conn) => {
      conn.on("data", (d) => {
        for (const line of d.toString().split("\n").filter(Boolean)) {
          const req = JSON.parse(line);
          if (req.method === "ping") {
            conn.write(JSON.stringify({ id: req.id, result: { pong: true } }) + "\n");
          } else if (req.method === "hang") {
            setTimeout(() => conn.destroy(), 10);
          }
          // everything else: never answered
        }
      });
    });
    await new Promise<void>((r) => server.listen(sock, r));
    return { sock, server };
  }

  it("rejects in-flight requests and fires onDisconnect when the socket dies", async () => {
    const { sock, server } = await fakeDaemon();
    try {
      const client = await DaemonClient.connect(sock);
      let disconnects = 0;
      client.onDisconnect = () => disconnects++;
      await expect(client.request("hang")).rejects.toThrow();
      await new Promise((r) => setTimeout(r, 50));
      expect(disconnects).toBe(1);
    } finally {
      server.close();
      fs.rmSync(sock, { force: true });
    }
  });

  it("rejects requests that outlive the request timeout", async () => {
    const { sock, server } = await fakeDaemon();
    try {
      const client = await DaemonClient.connect(sock, 1500, 50);
      await expect(client.request("never-answered")).rejects.toThrow(/timed out/);
      client.close();
    } finally {
      server.close();
      fs.rmSync(sock, { force: true });
    }
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
    // Cold spawn under repo-wide parallel test load can exceed 8s.
    const client = await ensureDaemon({ waitMs: 20000 });
    expect(client).not.toBeNull();
    const pong = (await client!.request("ping")) as { pong: boolean };
    expect(pong.pong).toBe(true);
    const agents = (await client!.request("agent.list")) as unknown[];
    expect(Array.isArray(agents)).toBe(true);
    client!.close();
  }, 30000);

  it("a second ensureDaemon is a no-op fast path", async () => {
    const started = Date.now();
    const client = await ensureDaemon();
    expect(client).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
    client!.close();
  });

  it("listAgents returns the attributed list over the real socket", async () => {
    const client = await ensureDaemon({ waitMs: 20000 });
    expect(client).not.toBeNull();
    const result = await client!.listAgents();
    // The contract is a bare attributed array, empty or not.
    expect(Array.isArray(result)).toBe(true);
    client!.close();
  }, 30000);
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
