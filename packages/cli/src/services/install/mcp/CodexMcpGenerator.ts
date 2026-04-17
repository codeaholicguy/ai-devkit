import * as fs from 'fs-extra';
import * as path from 'path';
import * as TOML from 'smol-toml';
import { EnvironmentCode, McpServerDefinition } from '../../../types';
import { BaseMcpGenerator } from './BaseMcpGenerator';

interface CodexConfig {
  mcp_servers?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export class CodexMcpGenerator extends BaseMcpGenerator {
  readonly agentType: EnvironmentCode = 'codex';

  private fullConfig: CodexConfig = {};

  protected toAgentFormat(def: McpServerDefinition): Record<string, unknown> {
    if (def.transport === 'stdio') {
      const entry: Record<string, unknown> = { command: def.command! };
      if (def.args && def.args.length > 0) entry.args = def.args;
      if (def.env && Object.keys(def.env).length > 0) entry.env = def.env;
      return entry;
    }

    // http or sse
    const entry: Record<string, unknown> = { url: def.url! };
    if (def.headers && Object.keys(def.headers).length > 0) entry.http_headers = def.headers;
    return entry;
  }

  protected async readExistingServers(projectRoot: string): Promise<Record<string, unknown>> {
    const configPath = path.join(projectRoot, '.codex', 'config.toml');
    try {
      if (await fs.pathExists(configPath)) {
        const content = await fs.readFile(configPath, 'utf-8');
        this.fullConfig = TOML.parse(content) as CodexConfig;
        return (this.fullConfig.mcp_servers || {}) as Record<string, unknown>;
      }
    } catch {
      // Malformed file — treat as empty
    }
    this.fullConfig = {};
    return {};
  }

  protected async writeServers(
    projectRoot: string,
    mergedServers: Record<string, unknown>
  ): Promise<void> {
    const output = { ...this.fullConfig, mcp_servers: mergedServers };
    const configPath = path.join(projectRoot, '.codex', 'config.toml');
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeFile(configPath, TOML.stringify(output), 'utf-8');
  }
}
