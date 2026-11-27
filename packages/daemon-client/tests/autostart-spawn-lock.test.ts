import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { daemonSocketPath } from "../src/client.js";
import { ensureDaemon } from "../src/autostart.js";
import type { DaemonBinary } from "../src/binary.js";

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

describe("ensureDaemon spawn lock while child is still starting", () => {
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

  it("keeps spawn lock when wait times out but the child is still booting", async () => {
    const bin = makeSlowFakeBin(binDir, 3500);
    const lockPath = `${daemonSocketPath()}.spawn.lock`;
    const resolveBinary = (): DaemonBinary => ({ path: bin, version: "9.9.9" });

    const first = ensureDaemon({ resolveBinary, waitMs: 400 });
    const second = ensureDaemon({ resolveBinary, waitMs: 6000 });

    await expect(first).resolves.toBeNull();
    expect(fs.existsSync(lockPath)).toBe(true);

    const client = await second;
    expect(client).not.toBeNull();
    expect(fs.existsSync(lockPath)).toBe(false);
  });
});
