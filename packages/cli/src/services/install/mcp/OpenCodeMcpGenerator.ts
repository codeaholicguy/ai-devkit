import fs from 'fs-extra';
import * as path from 'path';
import { EnvironmentCode, McpServerDefinition } from '../../../types.js';
import { BaseMcpGenerator } from './BaseMcpGenerator.js';

interface OpenCodeConfig {
  mcp?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export class OpenCodeMcpGenerator extends BaseMcpGenerator {
  readonly agentType: EnvironmentCode = 'opencode';

  private fullConfig: OpenCodeConfig = {};

  protected toAgentFormat(def: McpServerDefinition): Record<string, unknown> {
    if (def.transport === 'stdio') {
      const entry: Record<string, unknown> = {
        type: 'local',
        command: [def.command!, ...(def.args || [])],
        enabled: true,
      };
      if (def.env && Object.keys(def.env).length > 0) entry.environment = def.env;
      return entry;
    }

    const entry: Record<string, unknown> = {
      type: 'remote',
      url: def.url!,
      enabled: true,
    };
    if (def.headers && Object.keys(def.headers).length > 0) entry.headers = def.headers;
    return entry;
  }

  protected async readExistingServers(projectRoot: string): Promise<Record<string, unknown>> {
    const configPath = path.join(projectRoot, 'opencode.json');
    try {
      if (await fs.pathExists(configPath)) {
        const content = await fs.readFile(configPath, 'utf8');
        this.fullConfig = JSON.parse(content || '{}') as OpenCodeConfig;
        return (this.fullConfig.mcp || {}) as Record<string, unknown>;
      }
    } catch {
      // Malformed file — treat as empty.
    }
    this.fullConfig = {};
    return {};
  }

  protected async writeServers(
    projectRoot: string,
    mergedServers: Record<string, unknown>
  ): Promise<void> {
    const output = { ...this.fullConfig, mcp: mergedServers };
    const configPath = path.join(projectRoot, 'opencode.json');
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeFile(configPath, `${JSON.stringify(output, null, 2)}\n`);
  }
}
