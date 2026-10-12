import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DaemonClient } from "../client.js";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const devBin = [
  path.join(repoRoot, "rust/target/release/devkitd"),
  path.join(repoRoot, "rust/target/debug/devkitd"),
].find((p) => fs.existsSync(p));
const bin = process.env.DEVKITD_BIN ?? process.env.AI_DEVKITD_BIN ?? devBin;

/**
 * Issue #371 regression coverage at the daemon boundary: a stub `ps` on
 * PATH feeds devkitd synthetic procps output with PADDED columns — the
 * exact shape that used to make every row unparseable, leaving
 * `agent.list` permanently empty. Skipped when no devkitd binary exists
 * (CI builds it in the test job).
 */
describe.runIf(bin != null && process.platform !== "win32")("devkitd sweep with stub ps", () => {
  let home: string;
  let stubDir: string;
  let sock: string;
  let daemon: ChildProcess | null = null;

  const PADDED_PS = "  424242   1 pts/1    claude\n 424243 424242 pts/2    gemini\n";

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "devkitd-ps-e2e-"));
    stubDir = path.join(home, "stub-bin");
    fs.mkdirSync(stubDir);
    const stub = path.join(stubDir, "ps");
    fs.writeFileSync(stub, `#!/bin/sh\nprintf '%s' '${PADDED_PS}'\n`);
    fs.chmodSync(stub, 0o755);

    sock = path.join(home, ".ai-devkit", "daemon.sock");
    daemon = spawn(bin!, ["serve"], {
      env: {
        ...process.env,
        HOME: home,
        PATH: `${stubDir}${path.delimiter}${process.env.PATH}`,
        RUST_LOG: "warn",
      },
      stdio: "ignore",
    });
    daemon.unref();

    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(sock)) {
      if (daemon.exitCode !== null) throw new Error("devkitd exited before binding its socket");
      if (Date.now() > deadline) throw new Error("timed out waiting for daemon socket");
      await new Promise((r) => setTimeout(r, 50));
    }
  }, 15_000);

  afterAll(async () => {
    if (daemon) {
      const c = await DaemonClient.tryConnect(sock).catch(() => null);
      if (c) {
        await c.request("shutdown").catch(() => {});
        c.close();
      }
      daemon.kill("SIGKILL");
    }
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("agent.list reports agents from padded procps rows", async () => {
    const client = await DaemonClient.connect(sock);
    try {
      const agents = await client.listAgents();
      const pids = agents.map((a) => a.pid);
      expect(pids).toContain(424242);
      expect(agents.find((a) => a.pid === 424242)?.type).toBe("claude");
    } finally {
      client.close();
    }
  }, 15_000);
});
