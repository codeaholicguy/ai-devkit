import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DaemonClient } from "@ai-devkit/daemon-client";
import { baseEnv } from "./helpers";

const exec = promisify(execFile);
const root = join(__dirname, "..");
const binary = join(root, "rust/target/debug/devkitd");
const cli = join(root, "packages/cli/dist/cli.js");

// Proxy only records requests; all responses come from the real daemon. It
// verifies fanout targeting without starting agents or sending to real terminals.
describe("daemon-owned groups through the built CLI", () => {
  let fixture: string;
  let home: string;
  let data: string;
  let processHandle: ChildProcess;
  let proxy: Server;
  const sockets = new Set<Socket>();
  const requests: Array<{ method: string; params: any }> = [];
  let env: NodeJS.ProcessEnv;

  async function run(...args: string[]) {
    try {
      const r = await exec(process.execPath, [cli, ...args], { env, timeout: 15000 });
      return { ...r, code: 0 };
    } catch (e: any) {
      return { stdout: String(e.stdout ?? ""), stderr: String(e.stderr ?? ""), code: e.code };
    }
  }
  async function start() {
    processHandle = spawn(binary, ["serve"], {
      env: { ...baseEnv(), HOME: join(fixture, "daemon") },
      stdio: "ignore",
    });
    for (let i = 0; i < 100; i++) {
      const c = await DaemonClient.tryConnect(join(data, "daemon.sock"));
      if (c) {
        c.close();
        return;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error("fixture daemon failed to start");
  }
  async function stop() {
    if (processHandle && processHandle.exitCode === null && processHandle.signalCode === null) {
      const exited = new Promise<void>((r) => processHandle.once("exit", () => r()));
      processHandle.kill();
      await exited;
    }
  }
  beforeAll(async () => {
    fixture = mkdtempSync(join(tmpdir(), "group-e2e-"));
    home = join(fixture, "cli");
    data = join(fixture, "daemon/.ai-devkit");
    mkdirSync(join(home, ".ai-devkit"), { recursive: true });
    mkdirSync(data, { recursive: true });
    await start();
    // High, dead PIDs give deterministic daemon registrations. agent.lookup
    // resolves them, with alive=false; no terminal delivery can occur.
    await exec("python3", [
      "-c",
      `import sqlite3,sys
c=sqlite3.connect(sys.argv[1])
for i,n in enumerate(['first','second']):
 c.execute("INSERT INTO agents(pid,name,agent_type,cwd,runtime,runtime_ref,registered_at,first_seen,last_seen) VALUES(?,?,?,?,?,?,?,?,?)",(2147483640+i,n,'claude','/fixture','tmux','{}',1,1,1))
c.commit()`,
      join(data, "daemon.db"),
    ]);
    proxy = createServer((client) => {
      const upstream = createConnection(join(data, "daemon.sock"));
      sockets.add(client);
      sockets.add(upstream);
      let buffer = "";
      client.on("data", (chunk) => {
        buffer += chunk.toString();
        let at: number;
        while ((at = buffer.indexOf("\n")) >= 0) {
          requests.push(JSON.parse(buffer.slice(0, at)));
          buffer = buffer.slice(at + 1);
        }
      });
      for (const s of [client, upstream]) {
        s.on("error", () => {
          client.destroy();
          upstream.destroy();
        });
        s.on("close", () => sockets.delete(s));
      }
      client.pipe(upstream);
      upstream.pipe(client);
    });
    await new Promise<void>((r) => proxy.listen(join(home, ".ai-devkit/daemon.sock"), r));
    env = { ...baseEnv(), HOME: home, DEVKITD_BIN: binary, NODE_NO_WARNINGS: "1" };
    delete env.AI_DEVKIT_NO_DAEMON;
  });
  afterAll(async () => {
    for (const socket of sockets) socket.destroy();
    if (proxy) await new Promise<void>((r) => proxy.close(() => r()));
    await stop();
    if (fixture) rmSync(fixture, { recursive: true, force: true });
  });

  it("routes all group commands with ordered fanout lookups and survives restart", async () => {
    expect((await run("agent", "group", "create", "team", "--agent", "first")).code).toBe(0);
    expect((await run("agent", "group", "add", "team", "second")).code).toBe(0);
    requests.length = 0;
    const sent = await run("agent", "send", "fixture message", "--group", "team");
    expect(sent.code).toBe(1); // dead stub registrations are deliberately refused
    expect(requests.filter((r) => r.method === "group.lookup").map((r) => r.params.name)).toEqual([
      "team",
    ]);
    expect(requests.filter((r) => r.method === "agent.lookup").map((r) => r.params.name)).toEqual([
      "first",
      "second",
    ]);
    expect(sent.stdout + sent.stderr).toContain("no longer running");
    expect((await run("agent", "group", "detail", "team")).stdout).toMatch(/first[\s\S]*second/);
    expect((await run("agent", "group", "list")).stdout).toContain("team");
    expect(
      (await run("agent", "group", "update", "team", "--agent", "second", "--agent", "first")).code,
    ).toBe(0);
    expect((await run("agent", "group", "remove-agent", "team", "first")).code).toBe(0);
    const empty = await run("agent", "group", "remove-agent", "team", "second");
    expect(empty.code).toBe(1);
    expect(empty.stdout + empty.stderr).toContain("at least one member");
    const conflict = await run("agent", "group", "create", "team", "--agent", "first");
    expect(conflict.code).toBe(1);
    expect(conflict.stdout + conflict.stderr).toContain("already exists");
    await stop();
    await start();
    expect((await run("agent", "group", "detail", "team")).stdout).toContain("second");
    expect((await run("agent", "group", "remove", "team")).code).toBe(0);
    expect((await run("agent", "group", "detail", "team")).code).toBe(1);
  }, 30000);
});
