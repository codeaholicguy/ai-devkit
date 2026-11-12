import { mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createSetupService } from "../../../services/setup/setup.service.js";

describe("setup service — built-in skills consistency", () => {
  let homeDir: string;
  let builtInSkillInstalls: string[];

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "ai-devkit-setup-skills-home-"));
    builtInSkillInstalls = [];
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  function createService() {
    return createSetupService({
      homeDir,
      assetRoot: mkdtempSync(join(tmpdir(), "ai-devkit-setup-skills-assets-")),
      runCommand: async () => {},
      installBuiltInSkills: async (agent) => {
        builtInSkillInstalls.push(agent);
      },
    });
  }

  const cases = [
    { agent: "gemini", marker: join(".gemini") },
    { agent: "cursor", marker: join(".cursor") },
    { agent: "opencode", marker: join(".config", "opencode") },
    { agent: "grok", marker: join(".grok") },
    { agent: "antigravity-cli", marker: join(".gemini", "antigravity-cli") },
  ] as const;

  it.each(cases)(
    "installs built-in skills for $agent when its marker exists",
    async ({ agent, marker }) => {
      mkdirSync(join(homeDir, marker), { recursive: true });

      const report = await createService().run({ agents: [agent] });

      expect(report.results).toContainEqual(
        expect.objectContaining({
          agent,
          step: "built-in-skills",
          status: "installed",
        }),
      );
      expect(builtInSkillInstalls).toEqual([agent]);
    },
  );

  it.each(cases)("runs built-in-skills before memory-mcp for $agent", async ({ agent, marker }) => {
    mkdirSync(join(homeDir, marker), { recursive: true });

    const report = await createService().run({ agents: [agent] });

    const steps = report.results.map((result) => result.step);
    expect(steps).toEqual(["built-in-skills", "memory-mcp"]);
  });
});
