import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveDaemonBinary } from "../binary.js";
import { daemonSocketPath } from "../client.js";

describe("resolveDaemonBinary", () => {
  const original = process.env.AI_DEVKITD_BIN;
  afterEach(() => {
    if (original === undefined) delete process.env.AI_DEVKITD_BIN;
    else process.env.AI_DEVKITD_BIN = original;
  });

  it("honors AI_DEVKITD_BIN when the file exists", () => {
    const fake = path.join(os.tmpdir(), `fake-daemon-${process.pid}`);
    fs.writeFileSync(fake, "#!/bin/sh\n");
    process.env.AI_DEVKITD_BIN = fake;
    expect(resolveDaemonBinary()).toBe(fake);
    fs.unlinkSync(fake);
  });

  it("ignores AI_DEVKITD_BIN pointing at a missing file", () => {
    process.env.AI_DEVKITD_BIN = "/nonexistent/ai-devkitd-nope";
    expect(resolveDaemonBinary()).not.toBe("/nonexistent/ai-devkitd-nope");
  });
});

describe("daemonSocketPath", () => {
  it("lives under ~/.ai-devkit", () => {
    expect(daemonSocketPath()).toBe(
      path.join(os.homedir(), ".ai-devkit", "daemon.sock"),
    );
  });
});
