import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as TOML from "smol-toml";
import type { McpServerDefinition } from "../../../../types.js";
import { ClaudeCodeMcpGenerator } from "../../../../services/install/mcp/ClaudeCodeMcpGenerator.js";
import { CodexMcpGenerator } from "../../../../services/install/mcp/CodexMcpGenerator.js";
import { OpenCodeMcpGenerator } from "../../../../services/install/mcp/OpenCodeMcpGenerator.js";
import { GeminiMcpGenerator } from "../../../../services/install/mcp/GeminiMcpGenerator.js";
import { CursorMcpGenerator } from "../../../../services/install/mcp/CursorMcpGenerator.js";

const MEMORY: Record<string, McpServerDefinition> = {
  "ai-devkit-memory": { transport: "stdio", command: "npx", args: ["-y", "@ai-devkit/memory"] },
};

async function applyDrift(
  generator: { plan: Function; apply: Function },
  servers: Record<string, McpServerDefinition>,
  baseDir: string,
) {
  const plan = await generator.plan(servers, baseDir);
  plan.resolvedConflicts = [...plan.conflictServers];
  await generator.apply(plan, servers, baseDir);
}

describe("user-scope MCP generators", () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "ai-devkit-user-scope-"));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("defaults to project scope (existing behavior preserved)", () => {
    const generator = new ClaudeCodeMcpGenerator();
    expect(generator.agentType).toBe("claude");
    expect((generator as unknown as { scope: string }).scope).toBe("project");
  });

  it("claude user scope writes ~/.claude.json and preserves foreign keys", async () => {
    writeFileSync(
      join(homeDir, ".claude.json"),
      JSON.stringify({ numStartups: 7, tipsHistory: {} }),
    );
    const generator = new ClaudeCodeMcpGenerator("user");

    await applyDrift(generator, MEMORY, homeDir);

    const config = JSON.parse(readFileSync(join(homeDir, ".claude.json"), "utf-8"));
    expect(config.numStartups).toBe(7);
    expect(config.mcpServers["ai-devkit-memory"]).toEqual({
      command: "npx",
      args: ["-y", "@ai-devkit/memory"],
    });
  });

  it("claude user scope plan reports skipped when already wired", async () => {
    const generator = new ClaudeCodeMcpGenerator("user");
    await applyDrift(generator, MEMORY, homeDir);
    const first = readFileSync(join(homeDir, ".claude.json"), "utf-8");

    const plan = await generator.plan(MEMORY, homeDir);

    expect(plan.skippedServers).toEqual(["ai-devkit-memory"]);
    expect(plan.newServers).toEqual([]);
    expect(readFileSync(join(homeDir, ".claude.json"), "utf-8")).toBe(first);
  });

  it("gemini user scope writes ~/.gemini/settings.json mcpServers", async () => {
    const generator = new GeminiMcpGenerator("user");

    await applyDrift(generator, MEMORY, homeDir);

    const config = JSON.parse(readFileSync(join(homeDir, ".gemini", "settings.json"), "utf-8"));
    expect(config.mcpServers["ai-devkit-memory"]).toEqual({
      command: "npx",
      args: ["-y", "@ai-devkit/memory"],
    });
  });

  it("cursor user scope writes ~/.cursor/mcp.json mcpServers", async () => {
    const generator = new CursorMcpGenerator("user");

    await applyDrift(generator, MEMORY, homeDir);

    const config = JSON.parse(readFileSync(join(homeDir, ".cursor", "mcp.json"), "utf-8"));
    expect(config.mcpServers["ai-devkit-memory"]).toEqual({
      command: "npx",
      args: ["-y", "@ai-devkit/memory"],
    });
  });

  it("opencode user scope writes ~/.config/opencode/opencode.json mcp", async () => {
    const generator = new OpenCodeMcpGenerator("user");

    await applyDrift(generator, MEMORY, homeDir);

    const config = JSON.parse(
      readFileSync(join(homeDir, ".config", "opencode", "opencode.json"), "utf-8"),
    );
    expect(config.mcp["ai-devkit-memory"]).toEqual({
      type: "local",
      command: ["npx", "-y", "@ai-devkit/memory"],
      enabled: true,
    });
  });

  it("codex user scope appends the table preserving comments byte-for-byte elsewhere", async () => {
    mkdirSync(join(homeDir, ".codex"), { recursive: true });
    writeFileSync(
      join(homeDir, ".codex", "config.toml"),
      '# my config\nprofile = "default"\n\n[mcp_servers.other]\ncommand = "x"\n',
    );
    const generator = new CodexMcpGenerator("user");

    await applyDrift(generator, MEMORY, homeDir);

    const output = readFileSync(join(homeDir, ".codex", "config.toml"), "utf-8");
    expect(output).toContain("# my config");
    expect(output).toContain('[mcp_servers.other]\ncommand = "x"');
    expect(output).toContain("[mcp_servers.ai-devkit-memory]");
    const parsed = TOML.parse(output) as { mcp_servers: Record<string, unknown> };
    expect(parsed.mcp_servers["ai-devkit-memory"]).toEqual({
      command: "npx",
      args: ["-y", "@ai-devkit/memory"],
    });
    expect(parsed.mcp_servers["other"]).toEqual({ command: "x" });
  });

  it("codex user scope replaces an existing table and rerun is byte-stable", async () => {
    mkdirSync(join(homeDir, ".codex"), { recursive: true });
    writeFileSync(
      join(homeDir, ".codex", "config.toml"),
      '[mcp_servers.ai-devkit-memory]\ncommand = "node"\nargs = ["old"]\n',
    );
    const generator = new CodexMcpGenerator("user");

    await applyDrift(generator, MEMORY, homeDir);
    const first = readFileSync(join(homeDir, ".codex", "config.toml"), "utf-8");
    expect(first.match(/\[mcp_servers\.ai-devkit-memory\]/g)).toHaveLength(1);

    const plan = await generator.plan(MEMORY, homeDir);
    expect(plan.skippedServers).toEqual(["ai-devkit-memory"]);
    expect(readFileSync(join(homeDir, ".codex", "config.toml"), "utf-8")).toBe(first);
  });

  it("gemini and cursor are exposed with correct agent types", () => {
    expect(new GeminiMcpGenerator().agentType).toBe("gemini");
    expect(new CursorMcpGenerator().agentType).toBe("cursor");
    expect(existsSync(join(homeDir, ".gemini"))).toBe(false);
  });
});
