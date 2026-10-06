import fs from "fs-extra";
import { EnvironmentCode, McpServerDefinition } from "../../../types.js";
import { BaseMcpGenerator } from "./BaseMcpGenerator.js";
import { McpConfigScope } from "./types.js";

interface ClaudeMcpConfig {
  mcpServers?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export class ClaudeCodeMcpGenerator extends BaseMcpGenerator {
  readonly agentType: EnvironmentCode = "claude";

  protected readonly configPaths: { project: string; user?: string } = {
    project: ".mcp.json",
    // Claude Code user-scope servers live in ~/.claude.json (official docs).
    user: ".claude.json",
  };

  private fullConfig: ClaudeMcpConfig = {};

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

    // http or sse
    const entry: Record<string, unknown> = { type: def.transport, url: def.url! };
    if (def.headers && Object.keys(def.headers).length > 0) entry.headers = def.headers;
    return entry;
  }

  protected async readExistingServers(baseDir: string): Promise<Record<string, unknown>> {
    const configPath = this.resolveConfigPath(baseDir);
    if (await fs.pathExists(configPath)) {
      this.fullConfig = (await fs.readJson(configPath)) as ClaudeMcpConfig;
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
    await fs.writeJson(this.resolveConfigPath(baseDir), output, { spaces: 2 });
  }
}
