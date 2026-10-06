import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  MEMORY_MCP_SERVER,
  getGlobalMcpWriter,
} from "../../../../services/setup/memory-mcp/index.js";

describe("memory mcp global writers", () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "ai-devkit-mcp-home-"));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  describe("server spec", () => {
    it("launches the published memory package via npx", () => {
      expect(MEMORY_MCP_SERVER).toEqual({
        name: "ai-devkit-memory",
        command: "npx",
        args: ["-y", "@ai-devkit/memory"],
      });
    });
  });

  describe("claude (~/.claude.json)", () => {
    it("adds the memory server to mcpServers and preserves foreign state", async () => {
      writeFileSync(
        join(homeDir, ".claude.json"),
        JSON.stringify({
          numStartups: 42,
          projects: { "/tmp/x": { allowedTools: ["bash"] } },
          mcpServers: { context7: { command: "npx", args: ["-y", "@upstash/context7-mcp"] } },
        }),
      );

      const writer = getGlobalMcpWriter("claude");
      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);

      expect(result.status).toBe("installed");
      const config = JSON.parse(readFileSync(join(homeDir, ".claude.json"), "utf-8"));
      expect(config.numStartups).toBe(42);
      expect(config.projects["/tmp/x"].allowedTools).toEqual(["bash"]);
      expect(config.mcpServers["context7"]).toEqual({
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
      });
      expect(config.mcpServers["ai-devkit-memory"]).toEqual({
        command: "npx",
        args: ["-y", "@ai-devkit/memory"],
      });
    });

    it("creates the config file when missing", async () => {
      const writer = getGlobalMcpWriter("claude");
      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);

      expect(result.status).toBe("installed");
      const config = JSON.parse(readFileSync(join(homeDir, ".claude.json"), "utf-8"));
      expect(config.mcpServers["ai-devkit-memory"]).toEqual({
        command: "npx",
        args: ["-y", "@ai-devkit/memory"],
      });
    });

    it("is idempotent: rerun reports skipped and leaves the file byte-stable", async () => {
      const writer = getGlobalMcpWriter("claude");
      await writer!.apply(MEMORY_MCP_SERVER, homeDir);
      const first = readFileSync(join(homeDir, ".claude.json"), "utf-8");

      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);

      expect(result.status).toBe("skipped");
      expect(readFileSync(join(homeDir, ".claude.json"), "utf-8")).toBe(first);
    });

    it("overwrites drift on our entry only", async () => {
      writeFileSync(
        join(homeDir, ".claude.json"),
        JSON.stringify({
          mcpServers: {
            "ai-devkit-memory": { command: "node", args: ["/old/path/server.js"] },
            other: { command: "foo" },
          },
        }),
      );

      const writer = getGlobalMcpWriter("claude");
      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);

      expect(result.status).toBe("installed");
      const config = JSON.parse(readFileSync(join(homeDir, ".claude.json"), "utf-8"));
      expect(config.mcpServers["ai-devkit-memory"]).toEqual({
        command: "npx",
        args: ["-y", "@ai-devkit/memory"],
      });
      expect(config.mcpServers.other).toEqual({ command: "foo" });
    });

    it("reports inspect state wired after apply and unwired before", async () => {
      const writer = getGlobalMcpWriter("claude");
      expect((await writer!.inspect(homeDir)).state).toBe("unwired");
      await writer!.apply(MEMORY_MCP_SERVER, homeDir);
      expect((await writer!.inspect(homeDir)).state).toBe("wired");
    });
  });

  describe("gemini (~/.gemini/settings.json)", () => {
    it("upserts mcpServers preserving theme and other settings", async () => {
      mkdirSync(join(homeDir, ".gemini"));
      writeFileSync(
        join(homeDir, ".gemini", "settings.json"),
        JSON.stringify({ theme: "auto", mcpServers: { weather: { command: "weather-cli" } } }),
      );

      const writer = getGlobalMcpWriter("gemini");
      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);

      expect(result.status).toBe("installed");
      const config = JSON.parse(readFileSync(join(homeDir, ".gemini", "settings.json"), "utf-8"));
      expect(config.theme).toBe("auto");
      expect(config.mcpServers.weather).toEqual({ command: "weather-cli" });
      expect(config.mcpServers["ai-devkit-memory"]).toEqual({
        command: "npx",
        args: ["-y", "@ai-devkit/memory"],
      });
    });

    it("is idempotent on rerun", async () => {
      const writer = getGlobalMcpWriter("gemini");
      await writer!.apply(MEMORY_MCP_SERVER, homeDir);
      const first = readFileSync(join(homeDir, ".gemini", "settings.json"), "utf-8");
      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);
      expect(result.status).toBe("skipped");
      expect(readFileSync(join(homeDir, ".gemini", "settings.json"), "utf-8")).toBe(first);
    });
  });

  describe("cursor (~/.cursor/mcp.json)", () => {
    it("upserts mcpServers preserving foreign servers", async () => {
      mkdirSync(join(homeDir, ".cursor"));
      writeFileSync(
        join(homeDir, ".cursor", "mcp.json"),
        JSON.stringify({ mcpServers: { postgres: { command: "pg-mcp" } } }),
      );

      const writer = getGlobalMcpWriter("cursor");
      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);

      expect(result.status).toBe("installed");
      const config = JSON.parse(readFileSync(join(homeDir, ".cursor", "mcp.json"), "utf-8"));
      expect(config.mcpServers.postgres).toEqual({ command: "pg-mcp" });
      expect(config.mcpServers["ai-devkit-memory"]).toEqual({
        command: "npx",
        args: ["-y", "@ai-devkit/memory"],
      });
    });

    it("is idempotent on rerun", async () => {
      const writer = getGlobalMcpWriter("cursor");
      await writer!.apply(MEMORY_MCP_SERVER, homeDir);
      const first = readFileSync(join(homeDir, ".cursor", "mcp.json"), "utf-8");
      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);
      expect(result.status).toBe("skipped");
      expect(readFileSync(join(homeDir, ".cursor", "mcp.json"), "utf-8")).toBe(first);
    });
  });

  describe("opencode (~/.config/opencode/opencode.json)", () => {
    it("writes the opencode local-server entry with command array", async () => {
      mkdirSync(join(homeDir, ".config", "opencode"), { recursive: true });
      writeFileSync(
        join(homeDir, ".config", "opencode", "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          mcp: { docs: { type: "local", command: ["bun", "x", "docs-mcp"], enabled: true } },
        }),
      );

      const writer = getGlobalMcpWriter("opencode");
      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);

      expect(result.status).toBe("installed");
      const config = JSON.parse(
        readFileSync(join(homeDir, ".config", "opencode", "opencode.json"), "utf-8"),
      );
      expect(config.$schema).toBe("https://opencode.ai/config.json");
      expect(config.mcp.docs).toEqual({
        type: "local",
        command: ["bun", "x", "docs-mcp"],
        enabled: true,
      });
      expect(config.mcp["ai-devkit-memory"]).toEqual({
        type: "local",
        command: ["npx", "-y", "@ai-devkit/memory"],
        enabled: true,
      });
    });

    it("creates the XDG config dir and file when missing", async () => {
      const writer = getGlobalMcpWriter("opencode");
      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);

      expect(result.status).toBe("installed");
      const config = JSON.parse(
        readFileSync(join(homeDir, ".config", "opencode", "opencode.json"), "utf-8"),
      );
      expect(config.mcp["ai-devkit-memory"].enabled).toBe(true);
    });

    it("is idempotent on rerun", async () => {
      const writer = getGlobalMcpWriter("opencode");
      await writer!.apply(MEMORY_MCP_SERVER, homeDir);
      const first = readFileSync(join(homeDir, ".config", "opencode", "opencode.json"), "utf-8");
      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);
      expect(result.status).toBe("skipped");
      expect(readFileSync(join(homeDir, ".config", "opencode", "opencode.json"), "utf-8")).toBe(
        first,
      );
    });
  });

  describe("grok (~/.grok/user-settings.json)", () => {
    it("appends a stdio server to the mcp.servers array preserving apiKey and existing servers", async () => {
      mkdirSync(join(homeDir, ".grok"));
      writeFileSync(
        join(homeDir, ".grok", "user-settings.json"),
        JSON.stringify({
          apiKey: "sk-test",
          mcp: {
            servers: [
              {
                id: "context7",
                label: "Context7",
                enabled: true,
                transport: "stdio",
                command: "npx",
                args: ["-y", "@upstash/context7-mcp"],
              },
            ],
          },
        }),
      );

      const writer = getGlobalMcpWriter("grok");
      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);

      expect(result.status).toBe("installed");
      const config = JSON.parse(
        readFileSync(join(homeDir, ".grok", "user-settings.json"), "utf-8"),
      );
      expect(config.apiKey).toBe("sk-test");
      expect(config.mcp.servers).toHaveLength(2);
      expect(config.mcp.servers[0].id).toBe("context7");
      expect(config.mcp.servers[1]).toEqual({
        id: "ai-devkit-memory",
        label: "AI DevKit Memory",
        enabled: true,
        transport: "stdio",
        command: "npx",
        args: ["-y", "@ai-devkit/memory"],
      });
    });

    it("replaces our existing array entry in place instead of duplicating", async () => {
      mkdirSync(join(homeDir, ".grok"));
      writeFileSync(
        join(homeDir, ".grok", "user-settings.json"),
        JSON.stringify({
          mcp: {
            servers: [
              { id: "first", label: "First", enabled: true, transport: "stdio", command: "a" },
              {
                id: "ai-devkit-memory",
                label: "Old",
                enabled: false,
                transport: "stdio",
                command: "node",
                args: ["old.js"],
              },
            ],
          },
        }),
      );

      const writer = getGlobalMcpWriter("grok");
      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);

      expect(result.status).toBe("installed");
      const config = JSON.parse(
        readFileSync(join(homeDir, ".grok", "user-settings.json"), "utf-8"),
      );
      expect(config.mcp.servers).toHaveLength(2);
      expect(config.mcp.servers[0].id).toBe("first");
      expect(config.mcp.servers[1]).toEqual({
        id: "ai-devkit-memory",
        label: "AI DevKit Memory",
        enabled: true,
        transport: "stdio",
        command: "npx",
        args: ["-y", "@ai-devkit/memory"],
      });
    });

    it("is idempotent on rerun", async () => {
      const writer = getGlobalMcpWriter("grok");
      await writer!.apply(MEMORY_MCP_SERVER, homeDir);
      const first = readFileSync(join(homeDir, ".grok", "user-settings.json"), "utf-8");
      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);
      expect(result.status).toBe("skipped");
      expect(readFileSync(join(homeDir, ".grok", "user-settings.json"), "utf-8")).toBe(first);
    });

    it("creates the settings file when missing", async () => {
      const writer = getGlobalMcpWriter("grok");
      const result = await writer!.apply(MEMORY_MCP_SERVER, homeDir);
      expect(result.status).toBe("installed");
      const config = JSON.parse(
        readFileSync(join(homeDir, ".grok", "user-settings.json"), "utf-8"),
      );
      expect(config.mcp.servers[0].id).toBe("ai-devkit-memory");
    });
  });

  describe("malformed configs", () => {
    it("fails with a precise error and leaves the file untouched", async () => {
      writeFileSync(join(homeDir, ".claude.json"), "{ not json");
      const writer = getGlobalMcpWriter("claude");
      await expect(writer!.apply(MEMORY_MCP_SERVER, homeDir)).rejects.toThrow(
        /\.claude\.json.*JSON/i,
      );
      expect(readFileSync(join(homeDir, ".claude.json"), "utf-8")).toBe("{ not json");
    });
  });
});
