import fs from "fs-extra";
import { join } from "path";
import { deepEqual } from "../../../util/object.js";
import { MEMORY_MCP_SERVER } from "./spec.js";
import type {
  GlobalMcpWriter,
  MemoryMcpApplyResult,
  MemoryMcpInspectResult,
  MemoryMcpServerSpec,
} from "./spec.js";

/**
 * Antigravity CLI (`agy`) global MCP writer.
 *
 * Schema (per agy built-in docs, agy-customizations/docs/mcp_servers.md):
 *   ~/.gemini/config/mcp_config.json
 *   { "mcpServers": { "<id>": { "command", "args", "env" } | { "url" } } }
 *
 * The live file may legitimately exist as a 0-byte file (agy creates it
 * empty); that is treated as a blank slate rather than an error.
 */

interface AntigravityServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  [key: string]: unknown;
}

interface AntigravityMcpConfig {
  mcpServers?: Record<string, AntigravityServerEntry>;
  [key: string]: unknown;
}

const CONFIG_PATH = ".gemini/config/mcp_config.json";

function toEntry(spec: MemoryMcpServerSpec): AntigravityServerEntry {
  return {
    command: spec.command,
    args: [...spec.args],
  };
}

async function readConfig(homeDir: string): Promise<AntigravityMcpConfig> {
  const configPath = join(homeDir, ...CONFIG_PATH.split("/"));
  if (!(await fs.pathExists(configPath))) {
    return {};
  }
  const raw = (await fs.readFile(configPath, "utf-8")).trim();
  if (raw === "") {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Expected a JSON object in ${CONFIG_PATH}.`);
    }
    return parsed as AntigravityMcpConfig;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ~/${CONFIG_PATH}: ${(error as Error).message}`);
    }
    throw error;
  }
}

function readServers(config: AntigravityMcpConfig): Record<string, AntigravityServerEntry> {
  const servers = config.mcpServers;
  if (servers === undefined) {
    return {};
  }
  if (typeof servers !== "object" || servers === null || Array.isArray(servers)) {
    throw new Error(`Expected an object at "mcpServers" in ~/${CONFIG_PATH}.`);
  }
  return servers;
}

export const antigravityGlobalMcpWriter: GlobalMcpWriter = {
  agent: "antigravity-cli",
  configPath: CONFIG_PATH,

  async apply(spec: MemoryMcpServerSpec, homeDir: string): Promise<MemoryMcpApplyResult> {
    const configPath = join(homeDir, ...CONFIG_PATH.split("/"));
    const config = await readConfig(homeDir);
    const servers = readServers(config);
    const existing = servers[spec.name];

    if (existing !== undefined && deepEqual(existing, toEntry(spec))) {
      return { status: "skipped", message: `Already configured in ~/${CONFIG_PATH}.` };
    }

    const next: AntigravityMcpConfig = {
      ...config,
      mcpServers: { ...servers, [spec.name]: toEntry(spec) },
    };
    await fs.ensureDir(join(homeDir, ".gemini", "config"));
    await fs.writeJson(configPath, next, { spaces: 2 });
    return { status: "installed", message: `Configured in ~/${CONFIG_PATH}.` };
  },

  async inspect(homeDir: string): Promise<MemoryMcpInspectResult> {
    try {
      const config = await readConfig(homeDir);
      const servers = readServers(config);
      const entry = servers[MEMORY_MCP_SERVER.name];
      if (entry === undefined) {
        return { state: "unwired" };
      }
      if (!deepEqual(entry, toEntry(MEMORY_MCP_SERVER))) {
        return { state: "unwired", detail: "configured with a custom entry" };
      }
      return { state: "wired" };
    } catch (error) {
      return { state: "error", detail: error instanceof Error ? error.message : String(error) };
    }
  },
};
