import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { homeScopeMismatch, identityStoreExistsUnder } from "../../src/utils/homeScope.js";

describe("homeScope", () => {
  it("returns null when env HOME matches account home", () => {
    expect(homeScopeMismatch("/same/home", "/same/home")).toBeNull();
  });

  it("returns mismatch when env HOME diverges", () => {
    expect(homeScopeMismatch("/tmp/fakehome", "/real/home")).toEqual({
      envHome: "/tmp/fakehome",
      accountHome: "/real/home",
    });
  });

  it("detects identity store under a home directory", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "home-scope-"));
    expect(identityStoreExistsUnder(home)).toBe(false);
    fs.mkdirSync(path.join(home, ".ai-devkit"));
    expect(identityStoreExistsUnder(home)).toBe(true);
    fs.rmSync(home, { recursive: true, force: true });
  });
});
