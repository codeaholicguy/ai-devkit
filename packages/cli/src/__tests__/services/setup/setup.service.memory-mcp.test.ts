import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createSetupService } from "../../../services/setup/setup.service.js";

describe("setup service — memory-mcp step", () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "ai-devkit-setup-mcp-home-"));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  function createService() {
    return createSetupService({
      homeDir,
      assetRoot: mkdtempSync(join(tmpdir(), "ai-devkit-setup-mcp-assets-")),
      runCommand: async () => {},
      installBuiltInSkills: async () => {},
    });
  }

  it("wires gemini globally when ~/.gemini exists", async () => {
    mkdirSync(join(homeDir, ".gemini"));

    const report = await createService().run({ agents: ["gemini"] });

    expect(report.results).toContainEqual(
      expect.objectContaining({
        agent: "gemini",
        step: "memory-mcp",
        status: "installed",
      }),
    );
    const config = JSON.parse(readFileSync(join(homeDir, ".gemini", "settings.json"), "utf-8"));
    expect(config.mcpServers["ai-devkit-memory"]).toEqual({
      command: "npx",
      args: ["-y", "@ai-devkit/memory"],
    });
  });

  it("wires cursor globally when ~/.cursor exists", async () => {
    mkdirSync(join(homeDir, ".cursor"));

    const report = await createService().run({ agents: ["cursor"] });

    expect(report.results).toContainEqual(
      expect.objectContaining({ agent: "cursor", step: "memory-mcp", status: "installed" }),
    );
    const config = JSON.parse(readFileSync(join(homeDir, ".cursor", "mcp.json"), "utf-8"));
    expect(config.mcpServers["ai-devkit-memory"]).toBeDefined();
  });

  it("wires opencode globally when ~/.config/opencode exists", async () => {
    mkdirSync(join(homeDir, ".config", "opencode"), { recursive: true });

    const report = await createService().run({ agents: ["opencode"] });

    expect(report.results).toContainEqual(
      expect.objectContaining({ agent: "opencode", step: "memory-mcp", status: "installed" }),
    );
    const config = JSON.parse(
      readFileSync(join(homeDir, ".config", "opencode", "opencode.json"), "utf-8"),
    );
    expect(config.mcp["ai-devkit-memory"].enabled).toBe(true);
  });

  it("wires grok globally when ~/.grok exists", async () => {
    mkdirSync(join(homeDir, ".grok"));

    const report = await createService().run({ agents: ["grok"] });

    expect(report.results).toContainEqual(
      expect.objectContaining({ agent: "grok", step: "memory-mcp", status: "installed" }),
    );
    const config = JSON.parse(readFileSync(join(homeDir, ".grok", "user-settings.json"), "utf-8"));
    expect(config.mcp.servers[0].id).toBe("ai-devkit-memory");
  });

  it("wires codex memory-mcp after existing steps when ~/.codex exists", async () => {
    mkdirSync(join(homeDir, ".codex"));

    const report = await createService().run({ agents: ["codex"] });

    const mcpStep = report.results.find((result) => result.step === "memory-mcp");
    expect(mcpStep).toMatchObject({ agent: "codex", status: "installed" });
    expect(readFileSync(join(homeDir, ".codex", "config.toml"), "utf-8")).toContain(
      "[mcp_servers.ai-devkit-memory]",
    );
    const lastStep = report.results[report.results.length - 1];
    expect(lastStep.step).toBe("memory-mcp");
  });

  it("skips pi memory-mcp honestly because pi has no MCP support", async () => {
    mkdirSync(join(homeDir, ".pi"));

    const report = await createService().run({ agents: ["pi"] });

    const mcpStep = report.results.find((result) => result.step === "memory-mcp");
    expect(mcpStep).toMatchObject({ agent: "pi", status: "skipped" });
    expect(mcpStep!.message).toMatch(/no MCP support/i);
    expect(existsSync(join(homeDir, ".pi", "settings.json"))).toBe(false);
  });

  it("is idempotent across full reruns", async () => {
    for (const dir of [".gemini", ".cursor", ".grok", ".codex"]) {
      mkdirSync(join(homeDir, dir), { recursive: true });
    }

    const service = createService();
    await service.run();
    const second = await service.run();

    const mcpSteps = second.results.filter((result) => result.step === "memory-mcp");
    expect(mcpSteps.length).toBeGreaterThan(0);
    for (const step of mcpSteps) {
      expect(step.status).toBe("skipped");
      expect(step.message).toMatch(/Already configured/);
    }
  });

  it("reports failed memory-mcp for malformed configs without breaking other agents", async () => {
    mkdirSync(join(homeDir, ".gemini"));
    writeFileSync(join(homeDir, ".gemini", "settings.json"), "{ broken");
    mkdirSync(join(homeDir, ".grok"));

    const report = await createService().run();

    const geminiStep = report.results.find(
      (result) => result.agent === "gemini" && result.step === "memory-mcp",
    );
    expect(geminiStep!.status).toBe("failed");
    expect(geminiStep!.message).toMatch(/\.gemini\/settings\.json/i);
    const grokStep = report.results.find(
      (result) => result.agent === "grok" && result.step === "memory-mcp",
    );
    expect(grokStep!.status).toBe("installed");
  });

  it("skips agents whose dot-folder does not exist", async () => {
    const report = await createService().run({ agents: ["gemini"] });

    expect(report.results).toContainEqual(
      expect.objectContaining({
        agent: "gemini",
        step: "setup",
        status: "skipped",
        message: "~/.gemini does not exist.",
      }),
    );
  });
});
