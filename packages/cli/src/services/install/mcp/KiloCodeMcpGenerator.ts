import fs from 'fs-extra';
import * as path from 'path';
import { EnvironmentCode, McpServerDefinition } from '../../../types.js';
import { BaseMcpGenerator } from './BaseMcpGenerator.js';

interface KiloMcpConfig {
  mcp?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export class KiloCodeMcpGenerator extends BaseMcpGenerator {
  readonly agentType: EnvironmentCode = 'kilocode';

  private fullConfig: KiloMcpConfig = {};

  protected toAgentFormat(def: McpServerDefinition): Record<string, unknown> {
    if (def.transport === 'stdio') {
      const entry: Record<string, unknown> = {
        type: 'local',
        command: [def.command!, ...(def.args || [])],
        enabled: true,
        timeout: 10000,
      };
      if (def.env && Object.keys(def.env).length > 0) entry.environment = def.env;
      return entry;
    }

    const entry: Record<string, unknown> = {
      type: 'remote',
      url: def.url!,
      enabled: true,
      timeout: 15000,
    };
    if (def.headers && Object.keys(def.headers).length > 0) entry.headers = def.headers;
    return entry;
  }

  protected async readExistingServers(projectRoot: string): Promise<Record<string, unknown>> {
    const configPath = path.join(projectRoot, '.kilo', 'kilo.jsonc');
    try {
      if (await fs.pathExists(configPath)) {
        const content = await fs.readFile(configPath, 'utf8');
        this.fullConfig = parseJsonc(content);
        return (this.fullConfig.mcp || {}) as Record<string, unknown>;
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
    const output = { ...this.fullConfig, mcp: mergedServers };
    const configPath = path.join(projectRoot, '.kilo', 'kilo.jsonc');
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeFile(configPath, `${JSON.stringify(output, null, 2)}\n`);
  }
}

function parseJsonc(content: string): KiloMcpConfig {
  const json = stripTrailingCommas(stripJsonComments(content)).trim();
  return JSON.parse(json || '{}') as KiloMcpConfig;
}

function stripJsonComments(content: string): string {
  let output = '';
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      while (i < content.length && content[i] !== '\n') i++;
      output += '\n';
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
      i++;
      continue;
    }

    output += char;
  }

  return output;
}

function stripTrailingCommas(content: string): string {
  let output = '';
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === ',') {
      let nextIndex = i + 1;
      while (/\s/.test(content[nextIndex] || '')) nextIndex++;
      if (content[nextIndex] === '}' || content[nextIndex] === ']') {
        continue;
      }
    }

    output += char;
  }

  return output;
}
