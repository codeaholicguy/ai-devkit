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

interface GrokServerEntry {
  id: string;
  label: string;
  enabled: boolean;
  transport: "stdio" | "http" | "sse";
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  [key: string]: unknown;
}

interface GrokUserSettings {
  mcp?: { servers?: GrokServerEntry[] };
  [key: string]: unknown;
}

const CONFIG_PATH = ".grok/user-settings.json";

function toGrokEntry(spec: MemoryMcpServerSpec): GrokServerEntry {
  return {
    id: spec.name,
    label: "AI DevKit Memory",
    enabled: true,
    transport: "stdio",
    command: spec.command,
    args: [...spec.args],
  };
}

async function readSettings(homeDir: string): Promise<GrokUserSettings> {
  const configPath = join(homeDir, ...CONFIG_PATH.split("/"));
  if (!(await fs.pathExists(configPath))) {
    return {};
  }
  try {
    const parsed = await fs.readJson(configPath);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Expected a JSON object in ${CONFIG_PATH}.`);
    }
    return parsed as GrokUserSettings;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ~/${CONFIG_PATH}: ${(error as Error).message}`);
    }
    throw error;
  }
}

function readServers(settings: GrokUserSettings): GrokServerEntry[] {
  const servers = settings.mcp?.servers;
  if (servers === undefined) {
    return [];
  }
  if (!Array.isArray(servers)) {
    throw new Error(`Expected an array at "mcp.servers" in ~/${CONFIG_PATH}.`);
  }
  return servers;
}

/**
 * Grok CLI stores user-level MCP servers as an ARRAY in
 * `~/.grok/user-settings.json` under `mcp.servers`, upserted by `id`
 * (verified against superagent-ai/grok-cli src/utils/settings.ts).
 */
export const grokGlobalMcpWriter: GlobalMcpWriter = {
  agent: "grok",
  configPath: CONFIG_PATH,

  async apply(spec: MemoryMcpServerSpec, homeDir: string): Promise<MemoryMcpApplyResult> {
    const settings = await readSettings(homeDir);
    const servers = readServers(settings);
    const entry = toGrokEntry(spec);
    const index = servers.findIndex((server) => server?.id === spec.name);

    if (index >= 0 && deepEqual(entry, servers[index])) {
      return { status: "skipped", message: `Already configured in ~/${CONFIG_PATH}.` };
    }

    const merged = [...servers];
    if (index >= 0) {
      merged[index] = entry;
    } else {
      merged.push(entry);
    }
    settings.mcp = { ...settings.mcp, servers: merged };
    const configPath = join(homeDir, ...CONFIG_PATH.split("/"));
    await fs.ensureDir(join(configPath, ".."));
    await fs.writeFile(configPath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
    return { status: "installed", message: `Configured in ~/${CONFIG_PATH}.` };
  },

  async inspect(homeDir: string): Promise<MemoryMcpInspectResult> {
    try {
      const settings = await readSettings(homeDir);
      const current = readServers(settings).find((server) => server?.id === MEMORY_MCP_SERVER.name);
      if (current === undefined) {
        return { state: "unwired" };
      }
      return deepEqual(toGrokEntry(MEMORY_MCP_SERVER), current)
        ? { state: "wired" }
        : { state: "unwired", detail: "configured with a custom entry" };
    } catch (error) {
      return { state: "error", detail: error instanceof Error ? error.message : String(error) };
    }
  },
};
