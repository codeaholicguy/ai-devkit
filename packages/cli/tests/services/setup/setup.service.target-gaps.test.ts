import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSetupService,
  SUPPORTED_SETUP_AGENTS,
} from "../../../src/services/setup/setup.service.js";

const cases = [
  { agent: "kiro", marker: ".kiro", skills: false },
  { agent: "copilot", marker: ".copilot", skills: true },
  { agent: "devin", marker: ".config/devin", skills: true },
  { agent: "muse", marker: ".config/muse", skills: true },
] as const;

describe("setup targets for remaining startable agents", () => {
  let homeDir: string;
  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "setup-gaps-"));
  });
  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it.each(cases)("registers $agent and skips its absent marker", async ({ agent, marker }) => {
    expect(SUPPORTED_SETUP_AGENTS).toContain(agent);
    const report = await createSetupService({ homeDir }).run();
    expect(report.results).toContainEqual({
      agent,
      step: "setup",
      status: "skipped",
      message: `~/${marker} does not exist.`,
    });
  });

  it.each(cases)(
    "runs only supported steps for detected $agent",
    async ({ agent, marker, skills }) => {
      mkdirSync(join(homeDir, marker), { recursive: true });
      const installs: string[] = [];
      const service = createSetupService({
        homeDir,
        installBuiltInSkills: async (target) => {
          installs.push(target);
        },
      });
      for (let run = 0; run < 2; run++) {
        const report = await service.run();
        const results = report.results.filter((result) => result.agent === agent);
        expect(results.map((result) => result.step)).toEqual(
          skills ? ["built-in-skills", "memory-mcp"] : ["memory-mcp"],
        );
        expect(results.at(-1)).toEqual({
          agent,
          step: "memory-mcp",
          status: "skipped",
          message: `${agent} has no verified global MCP config surface; skipping memory MCP wiring.`,
        });
      }
      expect(installs).toEqual(skills ? [agent, agent] : []);
    },
  );
});
