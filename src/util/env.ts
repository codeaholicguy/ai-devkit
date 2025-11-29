import { EnvironmentDefinition, EnvironmentCode } from "../types.js";

export const ENVIRONMENT_DEFINITIONS: Record<
  EnvironmentCode,
  EnvironmentDefinition
> = {
  cursor: {
    code: "cursor",
    name: "Cursor",
    contextFileName: "AGENTS.md",
    commandPath: ".cursor/commands",
  },
  claude: {
    code: "claude",
    name: "Claude Code",
    contextFileName: "CLAUDE.md",
    commandPath: ".claude/commands",
  },
  github: {
    code: "github",
    name: "GitHub Copilot",
    contextFileName: "AGENTS.md",
    commandPath: ".github/prompts",
    customCommandExtension: ".prompt.md",
  },
  gemini: {
    code: "gemini",
    name: "Google Gemini",
    contextFileName: "AGENTS.md",
    commandPath: ".gemini/commands",
    isCustomCommandPath: true,
  },
  codex: {
    code: "codex",
    name: "OpenAI Codex",
    contextFileName: "AGENTS.md",
    commandPath: ".codex/commands",
  },
  windsurf: {
    code: "windsurf",
    name: "Windsurf",
    contextFileName: "AGENTS.md",
    commandPath: ".windsurf/commands",
  },
  kilocode: {
    code: "kilocode",
    name: "KiloCode",
    contextFileName: "AGENTS.md",
    commandPath: ".kilocode/commands",
  },
  amp: {
    code: "amp",
    name: "AMP",
    contextFileName: "AGENTS.md",
    commandPath: ".agents/commands",
  },
  opencode: {
    code: "opencode",
    name: "OpenCode",
    contextFileName: "AGENTS.md",
    commandPath: ".opencode/commands",
  },
  roo: {
    code: "roo",
    name: "Roo Code",
    contextFileName: ".roo/rules/AGENTS.md",
    commandPath: ".roo/commands",
  },
};

export const ALL_ENVIRONMENT_CODES: EnvironmentCode[] = Object.keys(
  ENVIRONMENT_DEFINITIONS,
) as EnvironmentCode[];

export function getAllEnvironments(): EnvironmentDefinition[] {
  return Object.values(ENVIRONMENT_DEFINITIONS);
}

export function getEnvironment(
  envCode: EnvironmentCode,
): EnvironmentDefinition | undefined {
  return ENVIRONMENT_DEFINITIONS[envCode];
}

export function getAllEnvironmentCodes(): EnvironmentCode[] {
  return [...ALL_ENVIRONMENT_CODES];
}

export function getEnvironmentsByCodes(
  codes: EnvironmentCode[],
): EnvironmentDefinition[] {
  return codes
    .map((code) => getEnvironment(code))
    .filter((env): env is EnvironmentDefinition => env !== undefined);
}

export function isValidEnvironmentCode(
  value: string,
): value is EnvironmentCode {
  return ALL_ENVIRONMENT_CODES.includes(value as EnvironmentCode);
}

export function getEnvironmentDisplayName(envCode: EnvironmentCode): string {
  const env = getEnvironment(envCode);
  return env ? env.name : envCode;
}

export function validateEnvironmentCodes(
  envCodes: string[],
): EnvironmentCode[] {
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
    throw new Error(`Invalid environment codes: ${invalidCodes.join(", ")}`);
  }

  return validCodes;
}
