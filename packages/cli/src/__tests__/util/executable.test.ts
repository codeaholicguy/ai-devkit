import { describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { commandExistsOnPath } from "../../util/executable.js";

describe("commandExistsOnPath", () => {
  it("finds an executable in a PATH directory", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ai-devkit-path-"));
    writeFileSync(path.join(dir, "fake-harness"), "#!/bin/sh\n");
    chmodSync(path.join(dir, "fake-harness"), 0o755);

    expect(commandExistsOnPath("fake-harness", dir)).toBe(true);
    expect(commandExistsOnPath("other-harness", dir)).toBe(false);
  });

  it("returns false for a non-executable file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ai-devkit-path-"));
    writeFileSync(path.join(dir, "not-exec"), "data");

    expect(commandExistsOnPath("not-exec", dir)).toBe(false);
  });
});
