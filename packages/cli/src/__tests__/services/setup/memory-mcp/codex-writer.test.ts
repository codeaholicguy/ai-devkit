import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as TOML from "smol-toml";
import {
  MEMORY_MCP_SERVER,
  getGlobalMcpWriter,
} from "../../../../services/setup/memory-mcp/index.js";

const EXISTING_TOML = `# User profile — do not delete
profile = "default"

# Approval policy for sandboxes
[approval_policy]
mode = "auto"

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
`;

describe("codex global mcp writer (~/.codex/config.toml)", () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "ai-devkit-codex-home-"));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("appends the mcp_servers table and preserves foreign content byte-for-byte", async () => {
    mkdirSync(join(homeDir, ".codex"));
    writeFileSync(join(homeDir, ".codex", "config.toml"), EXISTING_TOML);

    const writer = getGlobalMcpWriter("codex");
    const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);

    expect(result.status).toBe("installed");
    const output = readFileSync(join(homeDir, ".codex", "config.toml"), "utf-8");
    // Foreign lines are untouched, including comments.
    expect(output).toContain("# User profile — do not delete");
    expect(output).toContain("# Approval policy for sandboxes");
    expect(output).toContain("[mcp_servers.context7]");
    expect(output).toContain("[mcp_servers.ai-devkit-memory]");
    // The whole file still parses and carries our table.
    const parsed = TOML.parse(output) as Record<string, Record<string, unknown>>;
    expect(parsed.mcp_servers!["context7"]).toEqual({
      command: "npx",
      args: ["-y", "@upstash/context7-mcp"],
    });
    expect(parsed.mcp_servers!["ai-devkit-memory"]).toEqual({
      command: "npx",
      args: ["-y", "@ai-devkit/memory"],
    });
    expect(parsed.approval_policy).toEqual({ mode: "auto" });
  });

  it("replaces an existing ai-devkit-memory block instead of duplicating it", async () => {
    mkdirSync(join(homeDir, ".codex"));
    writeFileSync(
      join(homeDir, ".codex", "config.toml"),
      `${EXISTING_TOML}[mcp_servers.ai-devkit-memory]\ncommand = "node"\nargs = ["/old/server.js"]\n`,
    );

    const writer = getGlobalMcpWriter("codex");
    const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);

    expect(result.status).toBe("installed");
    const output = readFileSync(join(homeDir, ".codex", "config.toml"), "utf-8");
    expect(output.match(/\[mcp_servers\.ai-devkit-memory\]/g)).toHaveLength(1);
    const parsed = TOML.parse(output) as Record<string, Record<string, unknown>>;
    expect(parsed.mcp_servers!["ai-devkit-memory"]).toEqual({
      command: "npx",
      args: ["-y", "@ai-devkit/memory"],
    });
  });

  it("is idempotent: rerun reports skipped and leaves the file byte-stable", async () => {
    mkdirSync(join(homeDir, ".codex"));
    writeFileSync(join(homeDir, ".codex", "config.toml"), EXISTING_TOML);

    const writer = getGlobalMcpWriter("codex");
    await writer!.apply(MEMORY_MCP_SERVER, homeDir);
    const first = readFileSync(join(homeDir, ".codex", "config.toml"), "utf-8");

    const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);

    expect(result.status).toBe("skipped");
    expect(readFileSync(join(homeDir, ".codex", "config.toml"), "utf-8")).toBe(first);
  });

  it("creates the config file and directory when missing", async () => {
    const writer = getGlobalMcpWriter("codex");
    const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);

    expect(result.status).toBe("installed");
    const output = readFileSync(join(homeDir, ".codex", "config.toml"), "utf-8");
    const parsed = TOML.parse(output) as Record<string, Record<string, unknown>>;
    expect(parsed.mcp_servers!["ai-devkit-memory"]).toEqual({
      command: "npx",
      args: ["-y", "@ai-devkit/memory"],
    });
  });

  it("reports inspect wired after apply and unwired before", async () => {
    const writer = getGlobalMcpWriter("codex");
    expect((await writer!.inspect(homeDir)).state).toBe("unwired");
    await writer!.apply(MEMORY_MCP_SERVER, homeDir);
    expect((await writer!.inspect(homeDir)).state).toBe("wired");
  });

  it("refuses to touch malformed TOML and reports a precise error", async () => {
    mkdirSync(join(homeDir, ".codex"));
    writeFileSync(join(homeDir, ".codex", "config.toml"), "not [valid toml");

    const writer = getGlobalMcpWriter("codex");
    await expect(writer!.apply(MEMORY_MCP_SERVER, homeDir)).rejects.toThrow(/Invalid TOML/);
    expect(readFileSync(join(homeDir, ".codex", "config.toml"), "utf-8")).toBe("not [valid toml");
  });
});
