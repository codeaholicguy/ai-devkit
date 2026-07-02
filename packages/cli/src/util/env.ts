import { EnvironmentDefinition, EnvironmentCode } from '../types.js';

export const ENVIRONMENT_DEFINITIONS: Record<EnvironmentCode, EnvironmentDefinition> = {
  cursor: {
    code: 'cursor',
    name: 'Cursor',
    skillPath: '.cursor/skills',
    globalSkillPath: '.cursor/skills',
  },
  claude: {
    code: 'claude',
    name: 'Claude Code',
    skillPath: '.claude/skills',
    globalSkillPath: '.claude/skills',
    mcpConfigPath: '.mcp.json',
  },
  github: {
    code: 'github',
    name: 'GitHub Copilot',
    skillPath: '.github/skills',
    globalSkillPath: '.copilot/skills',
    mcpConfigPath: '.mcp.json',
  },
  gemini: {
    code: 'gemini',
    name: 'Google Gemini',
    skillPath: '.gemini/skills',
    globalSkillPath: '.gemini/skills',
  },
  grok: {
    code: 'grok',
    name: 'Grok',
    skillPath: '.grok/skills',
    globalSkillPath: '.grok/skills',
  },
  codex: {
    code: 'codex',
    name: 'OpenAI Codex',
    skillPath: '.agents/skills',
    globalSkillPath: '.codex/skills',
    mcpConfigPath: '.codex/config.toml',
  },
  kilocode: {
    code: 'kilocode',
    name: 'KiloCode',
    skillPath: '.kilo/skills',
    globalSkillPath: '.kilo/skills',
    mcpConfigPath: '.kilo/kilo.jsonc',
  },
  amp: {
    code: 'amp',
    name: 'AMP',
    skillPath: '.agents/skills',
    globalSkillPath: '.config/agents/skills',
  },
  opencode: {
    code: 'opencode',
    name: 'OpenCode',
    skillPath: '.opencode/skills',
    globalSkillPath: '.config/opencode/skills',
    mcpConfigPath: 'opencode.json',
  },
  roo: {
    code: 'roo',
    name: 'Roo Code',
    skillPath: '.roo/skills',
    globalSkillPath: '.roo/skills',
    mcpConfigPath: '.roo/mcp.json',
  },
  antigravity: {
    code: 'antigravity',
    name: 'Antigravity',
    skillPath: '.agent/skills',
    globalSkillPath: '.gemini/antigravity/skills',
  },
  'antigravity-cli': {
    code: 'antigravity-cli',
    name: 'Antigravity CLI',
    // The `agy` CLI reads project skills from <workspace>/.agents/skills and
    // user-global skills from ~/.gemini/config/skills.
    skillPath: '.agents/skills',
    globalSkillPath: '.gemini/config/skills',
  },
  junie: {
    code: 'junie',
    name: 'Junie',
    skillPath: '.junie/skills',
    globalSkillPath: '.junie/skills',
    mcpConfigPath: '.junie/mcp/mcp.json',
  },
  cline: {
    code: 'cline',
    name: 'Cline',
    skillPath: '.cline/skills',
    globalSkillPath: '.cline/skills',
  },
  devin: {
    code: 'devin',
    name: 'Devin',
    skillPath: '.devin/skills',
    globalSkillPath: '.config/devin/skills',
    mcpConfigPath: '.devin/config.json',
  },
  pi: {
    code: 'pi',
    name: 'Pi',
    skillPath: '.pi/skills',
    globalSkillPath: '.pi/agent/skills',
  }
};

export const ALL_ENVIRONMENT_CODES: EnvironmentCode[] = Object.keys(ENVIRONMENT_DEFINITIONS) as EnvironmentCode[];

export function getAllEnvironments(): EnvironmentDefinition[] {
  return Object.values(ENVIRONMENT_DEFINITIONS);
}

export function getEnvironment(envCode: EnvironmentCode): EnvironmentDefinition | undefined {
  return ENVIRONMENT_DEFINITIONS[envCode];
}

export function getAllEnvironmentCodes(): EnvironmentCode[] {
  return [...ALL_ENVIRONMENT_CODES];
}

export function getEnvironmentsByCodes(codes: EnvironmentCode[]): EnvironmentDefinition[] {
  return codes.map(code => getEnvironment(code)).filter((env): env is EnvironmentDefinition => env !== undefined);
}

export function isValidEnvironmentCode(value: string): value is EnvironmentCode {
  return ALL_ENVIRONMENT_CODES.includes(value as EnvironmentCode);
}

export function getEnvironmentDisplayName(envCode: EnvironmentCode): string {
  const env = getEnvironment(envCode);
  return env ? env.name : envCode;
}

export function validateEnvironmentCodes(envCodes: string[]): EnvironmentCode[] {
  const validCodes: EnvironmentCode[] = [];
  const invalidCodes: string[] = [];

  for (const code of envCodes) {
    if (isValidEnvironmentCode(code)) {
      validCodes.push(code);
    } else {
      invalidCodes.push(code);
    }
  }

  if (invalidCodes.length > 0) {
    throw new Error(`Invalid environment codes: ${invalidCodes.join(', ')}`);
  }

  return validCodes;
}

export function getSkillPath(envCode: EnvironmentCode): string | undefined {
  const env = getEnvironment(envCode);
  return env?.skillPath;
}

export function getGlobalSkillPath(envCode: EnvironmentCode): string | undefined {
  const env = getEnvironment(envCode);
  return env?.globalSkillPath;
}

export function getSkillCapableEnvironments(): EnvironmentDefinition[] {
  return getAllEnvironments().filter(env => env.skillPath !== undefined);
}

export function hasMcpSupport(envCode: EnvironmentCode): boolean {
  const env = getEnvironment(envCode);
  return env !== undefined && env.mcpConfigPath !== undefined;
}

export function getMcpConfigPath(envCode: EnvironmentCode): string | undefined {
  const env = getEnvironment(envCode);
  return env?.mcpConfigPath;
}
