import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "path";
import { ensureDaemon } from "../src/autostart.js";
import type { DaemonBinary } from "../src/binary.js";

describe("ensureDaemon divergent HOME guard (#402)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ["HOME", "DEVKITD_BIN", "AI_DEVKIT_NO_DAEMON", "VITEST"]) {
      saved[k] = process.env[k];
    }
    delete process.env.AI_DEVKIT_NO_DAEMON;
    delete process.env.VITEST;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("refuses autostart when HOME diverges from the account home", async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "aidk-fake-home-"));
    process.env.HOME = fakeHome;
    const accountHome = os.userInfo().homedir;
    const traces: string[] = [];
    const resolveBinary = (): DaemonBinary => ({
      path: "/nonexistent/devkitd",
      source: "test",
      version: "9.9.9",
    });

    const client = await ensureDaemon({
      resolveBinary,
      onDebug: (m) => traces.push(m),
    });

    expect(client).toBeNull();
    expect(traces.some((t) => t.includes("Refusing to auto-spawn"))).toBe(true);
    expect(path.resolve(fakeHome)).not.toBe(path.resolve(accountHome));
  });
});
