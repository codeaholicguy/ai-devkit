import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { isMainModule } from "../../src/entrypoint";

describe("isMainModule", () => {
  let dir: string;
  let modulePath: string;
  let moduleUrl: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "memory-entrypoint-"));
    modulePath = join(dir, "index.js");
    writeFileSync(modulePath, "");
    moduleUrl = pathToFileURL(modulePath).href;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns true when argv[1] is the module file", () => {
    expect(isMainModule(modulePath, moduleUrl)).toBe(true);
  });

  it("returns true when argv[1] is a bin symlink to the module file", () => {
    const binPath = join(dir, "ai-devkit-memory");
    symlinkSync(modulePath, binPath);

    expect(isMainModule(binPath, moduleUrl)).toBe(true);
  });

  it("returns false when argv[1] is a different file", () => {
    const otherPath = join(dir, "cli.js");
    writeFileSync(otherPath, "");

    expect(isMainModule(otherPath, moduleUrl)).toBe(false);
  });

  it("returns false when argv[1] is undefined", () => {
    expect(isMainModule(undefined, moduleUrl)).toBe(false);
  });

  it("returns false when argv[1] does not exist", () => {
    expect(isMainModule(join(dir, "missing.js"), moduleUrl)).toBe(false);
  });
});
