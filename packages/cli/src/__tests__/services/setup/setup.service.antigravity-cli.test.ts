import { existsSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createSetupService } from "../../../services/setup/setup.service.js";

const fsMkdir = (dir: string) => mkdirSync(dir, { recursive: true });

describe("setup service antigravity-cli target", () => {
  let homeDir: string;
  let assetRoot: string;
  let builtInSkillInstalls: string[];

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "ai-devkit-agy-home-"));
    assetRoot = mkdtempSync(join(tmpdir(), "ai-devkit-agy-assets-"));
    builtInSkillInstalls = [];
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(assetRoot, { recursive: true, force: true });
  });

  function createService() {
    return createSetupService({
      homeDir,
      assetRoot,
      runCommand: async () => {},
      installBuiltInSkills: async (agent) => {
        builtInSkillInstalls.push(agent);
      },
    });
  }

  it("skips antigravity-cli when ~/.gemini/antigravity-cli does not exist", async () => {
    const report = await createService().run();

    expect(report.results).toContainEqual(
      expect.objectContaining({
        agent: "antigravity-cli",
        step: "setup",
        status: "skipped",
        message: "~/.gemini/antigravity-cli does not exist.",
      }),
    );
  });

  it("accepts antigravity-cli as an explicit target and reports honest skips only", async () => {
    fsMkdir(join(homeDir, ".gemini", "antigravity-cli"));

    const report = await createService().run({ agents: ["antigravity-cli"] });

    // Built-in skills are tracked separately (#431): no invented steps.
    expect(report.results.some((result) => result.step === "built-in-skills")).toBe(false);
    expect(builtInSkillInstalls).toEqual([]);

    // Memory MCP is skipped with a useful reason: the agy MCP surface is
    // documented but not verified by ai-devkit yet.
    expect(report.results).toContainEqual(
      expect.objectContaining({
        agent: "antigravity-cli",
        step: "memory-mcp",
        status: "skipped",
        message: expect.stringContaining("not yet verified"),
      }),
    );

    // No invented hook/MCP support: nothing outside the dot folder is written.
    expect(existsSync(join(homeDir, ".gemini", "config"))).toBe(false);
  });

  it("is idempotent when the antigravity-cli dot folder exists", async () => {
    fsMkdir(join(homeDir, ".gemini", "antigravity-cli"));

    const first = await createService().run({ agents: ["antigravity-cli"] });
    const second = await createService().run({ agents: ["antigravity-cli"] });

    const shape = (results: typeof first.results) =>
      results.map((result) => `${result.step}:${result.status}`).sort();
    expect(shape(second.results)).toEqual(shape(first.results));
    expect(second.results.every((result) => result.status !== "failed")).toBe(true);
  });
});
