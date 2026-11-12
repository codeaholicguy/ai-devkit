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

describe("agent lookup/unregister wire calls", () => {
  /** Answers agent.lookup / agent.unregister for "known", coded not_found otherwise. */
  async function registryDaemon(): Promise<{ sock: string; server: net.Server; seen: unknown[] }> {
    const sock = path.join(os.tmpdir(), `fake-reg-${process.pid}-${Date.now()}.sock`);
    const seen: unknown[] = [];
    const server = net.createServer((conn) => {
      conn.on("data", (d) => {
        for (const line of d.toString().split("\n").filter(Boolean)) {
          const req = JSON.parse(line);
          seen.push({ method: req.method, params: req.params });
          const target = req.params?.name ?? req.params?.from;
          if (target !== "known") {
            conn.write(
              JSON.stringify({
                id: req.id,
                error: `No registered agent named "${target}".`,
                code: "not_found",
                details: { name: target },
              }) + "\n",
            );
          } else if (req.method === "agent.lookup") {
            conn.write(
              JSON.stringify({
                id: req.id,
                result: {
                  name: "known",
                  type: "claude",
                  pid: 42,
                  runtime: "tmux",
                  runtimeRef: { session: "known" },
                  cwd: "/repo",
                  pinned: false,
                  alive: true,
                },
              }) + "\n",
            );
          } else if (req.method === "agent.unregister") {
            conn.write(JSON.stringify({ id: req.id, result: { name: "known", pid: 42 } }) + "\n");
          } else if (req.method === "agent.rename") {
            conn.write(
              JSON.stringify({
                id: req.id,
                result: {
                  from: "known",
                  to: req.params.to,
                  pid: 42,
                  runtime: "tmux",
                  runtimeRef: { session: req.params.to },
                  runtimeRenamed: true,
                  warnings: [],
                },
              }) + "\n",
            );
          }
        }
      });
    });
    await new Promise<void>((r) => server.listen(sock, r));
    return { sock, server, seen };
  }

  it("lookupAgent and unregisterAgent send the name and return typed results", async () => {
    const { sock, server, seen } = await registryDaemon();
    try {
      const client = await DaemonClient.connect(sock);
      const found = await client.lookupAgent("known");
      expect(found.runtimeRef).toEqual({ session: "known" });
      expect(found.alive).toBe(true);
      expect(await client.unregisterAgent("known")).toEqual({ name: "known", pid: 42 });
      expect(seen).toEqual([
        { method: "agent.lookup", params: { name: "known" } },
        { method: "agent.unregister", params: { name: "known" } },
      ]);
      await expect(client.lookupAgent("nobody")).rejects.toMatchObject({ code: "not_found" });
      client.close();
    } finally {
      server.close();
      fs.rmSync(sock, { force: true });
    }
  });

  it("renameAgent sends from/to and returns the typed result", async () => {
    const { sock, server, seen } = await registryDaemon();
    try {
      const client = await DaemonClient.connect(sock);
      const r = await client.renameAgent("known", "fresh");
      expect(r).toMatchObject({ from: "known", to: "fresh", runtimeRenamed: true });
      expect(r.runtimeRef).toEqual({ session: "fresh" });
      expect(seen).toEqual([{ method: "agent.rename", params: { from: "known", to: "fresh" } }]);
      await expect(client.renameAgent("nobody", "x2")).rejects.toMatchObject({
        code: "not_found",
      });
      client.close();
    } finally {
      server.close();
      fs.rmSync(sock, { force: true });
    }
  });
});
