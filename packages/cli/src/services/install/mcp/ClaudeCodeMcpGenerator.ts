import * as fs from 'fs-extra';
import * as path from 'path';
import { EnvironmentCode, McpServerDefinition } from '../../../types';
import { BaseMcpGenerator } from './BaseMcpGenerator';

interface ClaudeMcpConfig {
  mcpServers?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export class ClaudeCodeMcpGenerator extends BaseMcpGenerator {
  readonly agentType: EnvironmentCode = 'claude';

  private fullConfig: ClaudeMcpConfig = {};

  protected toAgentFormat(def: McpServerDefinition): Record<string, unknown> {
    if (def.transport === 'stdio') {
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

  protected async readExistingServers(projectRoot: string): Promise<Record<string, unknown>> {
    const configPath = path.join(projectRoot, '.mcp.json');
    try {
      if (await fs.pathExists(configPath)) {
        this.fullConfig = await fs.readJson(configPath);
        return (this.fullConfig.mcpServers || {}) as Record<string, unknown>;
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
    const output = { ...this.fullConfig, mcpServers: mergedServers };
    await fs.writeJson(path.join(projectRoot, '.mcp.json'), output, { spaces: 2 });
  }
}
