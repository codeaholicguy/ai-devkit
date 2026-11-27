import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { daemonSocketPath } from "../src/client.js";
import { ensureDaemon } from "../src/autostart.js";
import type { DaemonBinary } from "../src/binary.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));

/** Fake devkitd that sleeps before binding — reproduces client wait timeout (#495). */
function makeSlowFakeBin(dir: string, delayMs: number): string {
  const file = path.join(dir, "slow-devkitd");
  fs.writeFileSync(
    file,
    `#!/usr/bin/env node
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const os = require("node:os");
const delay = ${delayMs};
if (process.argv[2] === "version") {
  console.log(JSON.stringify({ version: "0.1.0", buildVersion: "9.9.9" }));
  process.exit(0);
}
const dir = path.join(os.homedir(), ".ai-devkit");
const sock = path.join(dir, "daemon.sock");
fs.mkdirSync(dir, { recursive: true });
fs.appendFileSync(path.join(dir, "slow-pids"), process.pid + "\\n");
setTimeout(() => {
  const server = net.createServer((conn) => {
    let buf = "";
    conn.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\\n")) >= 0) {
        const req = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        conn.write(JSON.stringify({ id: req.id, result: { pong: true } }) + "\\n");
      }
    });
  });
  server.listen(sock);
}, delay);
`,
  );
  fs.chmodSync(file, 0o755);
  return file;
}

describe("ensureDaemon spawn lock", () => {
  let home: string;
  let binDir: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "aidk-spawnlock-home-"));
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), "aidk-spawnlock-bin-"));
    for (const k of ["HOME", "DEVKITD_BIN", "AI_DEVKIT_NO_DAEMON", "VITEST"])
      saved[k] = process.env[k];
    process.env.HOME = home;
    delete process.env.AI_DEVKIT_NO_DAEMON;
    delete process.env.VITEST;
  });

  afterEach(() => {
    const pids = path.join(home, ".ai-devkit", "slow-pids");
    if (fs.existsSync(pids)) {
      for (const pid of fs.readFileSync(pids, "utf8").split("\n").filter(Boolean)) {
        try {
          process.kill(Number(pid), "SIGKILL");
        } catch {
          /* already gone */
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

  it("releases spawn lock when the socket wait times out", async () => {
    const bin = makeSlowFakeBin(binDir, 5000);
    const lockPath = `${daemonSocketPath()}.spawn.lock`;
    const resolveBinary = (): DaemonBinary => ({ path: bin, version: "9.9.9" });

    const client = await ensureDaemon({ resolveBinary, waitMs: 200 });
    expect(client).toBeNull();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("reclaims spawn lock when the recorded devkitd pid has exited", async () => {
    const lockPath = `${daemonSocketPath()}.spawn.lock`;
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, "999999999");

    const bin = makeSlowFakeBin(binDir, 50);
    const resolveBinary = (): DaemonBinary => ({ path: bin, version: "9.9.9" });
    const client = await ensureDaemon({ resolveBinary, waitMs: 3000 });
    expect(client).not.toBeNull();
    client?.close();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("short-lived caller subprocess exits promptly when devkitd binds slowly", async () => {
    const bin = makeSlowFakeBin(binDir, 8000);
    const runner = path.join(home, "run-ensure-once.mjs");
    const autostart = path.join(testDir, "../dist/autostart.js");
    fs.writeFileSync(
      runner,
      `import { ensureDaemon } from ${JSON.stringify(autostart)};
await ensureDaemon({
  waitMs: 250,
  resolveBinary: () => ({ path: process.env.BIN, version: "9.9.9" }),
});
`,
    );

    const start = Date.now();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [runner], {
        env: { ...process.env, HOME: home, BIN: bin, VITEST: undefined },
        stdio: "ignore",
      });
      const killTimer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("subprocess hung (event loop kept alive)"));
      }, 2500);
      child.on("exit", (code) => {
        clearTimeout(killTimer);
        if (code === 0) resolve();
        else reject(new Error(`subprocess exited ${code}`));
      });
    });
    expect(Date.now() - start).toBeLessThan(2000);
  }, 15000);
});
