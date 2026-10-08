import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveDaemonBinary } from "../binary.js";
import { daemonSocketPath } from "../client.js";

describe("resolveDaemonBinary", () => {
  const saved = {
    DEVKITD_BIN: process.env.DEVKITD_BIN,
    AI_DEVKITD_BIN: process.env.AI_DEVKITD_BIN,
  };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("honors DEVKITD_BIN when the file exists", () => {
    const fake = path.join(os.tmpdir(), `fake-daemon-${process.pid}`);
    fs.writeFileSync(fake, "#!/bin/sh\n");
    process.env.DEVKITD_BIN = fake;
    expect(resolveDaemonBinary()).toBe(fake);
    fs.unlinkSync(fake);
  });

  it("accepts AI_DEVKITD_BIN as a deprecated alias", () => {
    delete process.env.DEVKITD_BIN;
    const fake = path.join(os.tmpdir(), `fake-daemon-legacy-${process.pid}`);
    fs.writeFileSync(fake, "#!/bin/sh\n");
    process.env.AI_DEVKITD_BIN = fake;
    expect(resolveDaemonBinary()).toBe(fake);
    fs.unlinkSync(fake);
  });

  it("DEVKITD_BIN wins over AI_DEVKITD_BIN", () => {
    const a = path.join(os.tmpdir(), `fake-a-${process.pid}`);
    const b = path.join(os.tmpdir(), `fake-b-${process.pid}`);
    fs.writeFileSync(a, "#!/bin/sh\n");
    fs.writeFileSync(b, "#!/bin/sh\n");
    process.env.DEVKITD_BIN = a;
    process.env.AI_DEVKITD_BIN = b;
    expect(resolveDaemonBinary()).toBe(a);
    fs.unlinkSync(a);
    fs.unlinkSync(b);
  });

  it("ignores DEVKITD_BIN pointing at a missing file", () => {
    delete process.env.AI_DEVKITD_BIN;
    process.env.DEVKITD_BIN = "/nonexistent/devkitd-nope";
    expect(resolveDaemonBinary()).not.toBe("/nonexistent/devkitd-nope");
  });
});

describe("daemonSocketPath", () => {
  it("lives under ~/.ai-devkit", () => {
    expect(daemonSocketPath()).toBe(path.join(os.homedir(), ".ai-devkit", "daemon.sock"));
  });
});
