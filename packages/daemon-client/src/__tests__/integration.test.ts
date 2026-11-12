import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { DaemonClient } from "../client.js";

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
