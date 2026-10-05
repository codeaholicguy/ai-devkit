import fs from "fs-extra";
import * as path from "path";
import { EnvironmentCode, McpServerDefinition } from "../../../types.js";
import { BaseMcpGenerator } from "./BaseMcpGenerator.js";
import { McpConfigScope } from "./types.js";

interface CursorMcpConfig {
  mcpServers?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Cursor MCP config is `mcp.json` → `mcpServers`
 * (project: .cursor/mcp.json, global: ~/.cursor/mcp.json;
 * official docs: cursor.com/docs/context/mcp).
 */
export class CursorMcpGenerator extends BaseMcpGenerator {
  readonly agentType: EnvironmentCode = "cursor";

  protected readonly configPaths: { project: string; user?: string } = {
    project: ".cursor/mcp.json",
    user: ".cursor/mcp.json",
  };

  private fullConfig: CursorMcpConfig = {};

  constructor(scope: McpConfigScope = "project") {
    super(scope);
  }

  protected toAgentFormat(def: McpServerDefinition): Record<string, unknown> {
    if (def.transport === "stdio") {
      const entry: Record<string, unknown> = { command: def.command! };
      if (def.args && def.args.length > 0) entry.args = def.args;
      if (def.env && Object.keys(def.env).length > 0) entry.env = def.env;
      return entry;
    }

    const entry: Record<string, unknown> = { type: def.transport, url: def.url! };
    if (def.headers && Object.keys(def.headers).length > 0) entry.headers = def.headers;
    return entry;
  }

  protected async readExistingServers(baseDir: string): Promise<Record<string, unknown>> {
    const configPath = this.resolveConfigPath(baseDir);
    if (await fs.pathExists(configPath)) {
      this.fullConfig = (await fs.readJson(configPath)) as CursorMcpConfig;
      return (this.fullConfig.mcpServers || {}) as Record<string, unknown>;
    }
    this.fullConfig = {};
    return {};
  }

  protected async writeServers(
    baseDir: string,
    mergedServers: Record<string, unknown>,
  ): Promise<void> {
    const output = { ...this.fullConfig, mcpServers: mergedServers };
    const configPath = this.resolveConfigPath(baseDir);
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, output, { spaces: 2 });
  }
}
