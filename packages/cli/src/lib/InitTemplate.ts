import * as fs from 'fs-extra';
import * as path from 'path';
import YAML from 'yaml';
import { AVAILABLE_PHASES, EnvironmentCode, MCP_TRANSPORTS, McpServerDefinition, McpTransport, Phase } from '../types';
import { isValidEnvironmentCode } from '../util/env';

export interface InitTemplateSkill {
  registry: string;
  skill: string;
}

export interface InitTemplateConfig {
  version?: number | string;
  paths?: {
    docs?: string;
  };
  environments?: EnvironmentCode[];
  phases?: Phase[];
  registries?: Record<string, string>;
  skills?: InitTemplateSkill[];
  mcpServers?: Record<string, McpServerDefinition>;
}

const ALLOWED_TEMPLATE_FIELDS = new Set(['version', 'paths', 'environments', 'phases', 'registries', 'skills', 'mcpServers']);

function validationError(templatePath: string, message: string): Error {
  return new Error(`Invalid template at ${templatePath}: ${message}`);
}

function parseRawTemplate(content: string, resolvedPath: string): unknown {
  const ext = path.extname(resolvedPath).toLowerCase();

  if (ext === '.json') {
    try {
      return JSON.parse(content);
    } catch (error) {
      throw validationError(
        resolvedPath,
        `failed to parse JSON (${error instanceof Error ? error.message : String(error)})`
      );
    }
  }

  if (ext === '.yaml' || ext === '.yml' || ext === '') {
    try {
      return YAML.parse(content);
    } catch (error) {
      throw validationError(
        resolvedPath,
        `failed to parse YAML (${error instanceof Error ? error.message : String(error)})`
      );
    }
  }

  try {
    return YAML.parse(content);
  } catch {
    try {
      return JSON.parse(content);
    } catch {
      throw validationError(
        resolvedPath,
        `unsupported extension "${ext}"; use .yaml, .yml, or .json`
      );
    }
  }
}

function validateTemplate(raw: unknown, resolvedPath: string): InitTemplateConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw validationError(resolvedPath, 'template root must be an object');
  }

  const candidate = raw as Record<string, unknown>;
  const unknownKeys = Object.keys(candidate).filter(key => !ALLOWED_TEMPLATE_FIELDS.has(key));
  if (unknownKeys.length > 0) {
    throw validationError(resolvedPath, `unknown field(s): ${unknownKeys.join(', ')}`);
  }

  const result: InitTemplateConfig = {};

  if (candidate.version !== undefined) {
    if (typeof candidate.version !== 'string' && typeof candidate.version !== 'number') {
      throw validationError(resolvedPath, '"version" must be a string or number');
    }
    result.version = candidate.version;
  }

  if (candidate.paths !== undefined) {
    if (typeof candidate.paths !== 'object' || candidate.paths === null || Array.isArray(candidate.paths)) {
      throw validationError(resolvedPath, '"paths" must be an object');
    }
    const paths = candidate.paths as Record<string, unknown>;
    if (paths.docs !== undefined) {
      if (typeof paths.docs !== 'string' || paths.docs.trim().length === 0) {
        throw validationError(resolvedPath, '"paths.docs" must be a non-empty string');
      }
      result.paths = { docs: paths.docs.trim() };
    }
  }

  if (candidate.environments !== undefined) {
    if (!Array.isArray(candidate.environments)) {
      throw validationError(resolvedPath, '"environments" must be an array of environment codes');
    }

    result.environments = candidate.environments.map((value, index) => {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw validationError(resolvedPath, `"environments[${index}]" must be a non-empty string`);
      }

      const normalized = value.trim();
      if (!isValidEnvironmentCode(normalized)) {
        throw validationError(
          resolvedPath,
          `"environments[${index}]" has invalid value "${normalized}"`
        );
      }

      return normalized;
    });
  }

  if (candidate.phases !== undefined) {
    if (!Array.isArray(candidate.phases)) {
      throw validationError(resolvedPath, '"phases" must be an array of phase names');
    }

    result.phases = candidate.phases.map((value, index) => {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw validationError(resolvedPath, `"phases[${index}]" must be a non-empty string`);
      }

      const normalized = value.trim();
      if (!AVAILABLE_PHASES.includes(normalized as Phase)) {
        throw validationError(resolvedPath, `"phases[${index}]" has invalid value "${normalized}"`);
      }

      return normalized as Phase;
    });
  }

  if (candidate.registries !== undefined) {
    result.registries = validateStringRecord(candidate.registries, 'registries', resolvedPath);
  }

  if (candidate.skills !== undefined) {
    if (!Array.isArray(candidate.skills)) {
      throw validationError(resolvedPath, '"skills" must be an array of skill objects');
    }

    result.skills = candidate.skills.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw validationError(resolvedPath, `"skills[${index}]" must be an object`);
      }

      const skillEntry = entry as Record<string, unknown>;
      const { registry, skill } = skillEntry;

      if (typeof registry !== 'string' || registry.trim().length === 0) {
        throw validationError(resolvedPath, `"skills[${index}].registry" must be a non-empty string`);
      }

      if (typeof skill !== 'string' || skill.trim().length === 0) {
        throw validationError(resolvedPath, `"skills[${index}].skill" must be a non-empty string`);
      }

      return {
        registry: registry.trim(),
        skill: skill.trim()
      };
    });
  }

  if (candidate.mcpServers !== undefined) {
    result.mcpServers = validateMcpServers(candidate.mcpServers, resolvedPath);
  }

  return result;
}

function validateStringRecord(
  value: unknown,
  fieldPath: string,
  resolvedPath: string
): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw validationError(resolvedPath, `"${fieldPath}" must be an object of string values`);
  }
  const record = value as Record<string, unknown>;
  for (const [key, val] of Object.entries(record)) {
    if (typeof val !== 'string') {
      throw validationError(resolvedPath, `"${fieldPath}.${key}" must be a string`);
    }
  }
  return record as Record<string, string>;
}

function validateMcpServers(
  raw: unknown,
  resolvedPath: string
): Record<string, McpServerDefinition> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw validationError(resolvedPath, '"mcpServers" must be an object');
  }

  const servers = raw as Record<string, unknown>;
  const validated: Record<string, McpServerDefinition> = {};

  for (const [name, value] of Object.entries(servers)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw validationError(resolvedPath, `"mcpServers.${name}" must be an object`);
    }

    const server = value as Record<string, unknown>;
    const prefix = `mcpServers.${name}`;

    if (typeof server.transport !== 'string' || !MCP_TRANSPORTS.includes(server.transport as McpTransport)) {
      throw validationError(resolvedPath, `"${prefix}.transport" must be one of: ${MCP_TRANSPORTS.join(', ')}`);
    }

    const transport = server.transport as McpTransport;
    const def: McpServerDefinition = { transport };

    if (transport === 'stdio') {
      if (typeof server.command !== 'string' || server.command.trim().length === 0) {
        throw validationError(resolvedPath, `"${prefix}.command" is required for stdio transport`);
      }
      def.command = server.command.trim();

      if (server.args !== undefined) {
        if (!Array.isArray(server.args) || !server.args.every((a: unknown) => typeof a === 'string')) {
          throw validationError(resolvedPath, `"${prefix}.args" must be an array of strings`);
        }
        def.args = server.args as string[];
      }

      if (server.env !== undefined) {
        def.env = validateStringRecord(server.env, `${prefix}.env`, resolvedPath);
      }
    } else {
      // http or sse
      if (typeof server.url !== 'string' || server.url.trim().length === 0) {
        throw validationError(resolvedPath, `"${prefix}.url" is required for ${transport} transport`);
      }
      def.url = server.url.trim();

      if (server.headers !== undefined) {
        def.headers = validateStringRecord(server.headers, `${prefix}.headers`, resolvedPath);
      }
    }

    validated[name] = def;
  }

  return validated;
}

export async function loadInitTemplate(templatePath: string): Promise<InitTemplateConfig> {
  if (!templatePath || templatePath.trim().length === 0) {
    throw new Error('Template path is required');
  }

  const resolvedPath = path.isAbsolute(templatePath)
    ? templatePath
    : path.resolve(process.cwd(), templatePath);

  if (!await fs.pathExists(resolvedPath)) {
    throw new Error(`Template file not found: ${resolvedPath}`);
  }

  let rawContent = '';
  try {
    rawContent = await fs.readFile(resolvedPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Failed to read template file ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const parsed = parseRawTemplate(rawContent, resolvedPath);
  return validateTemplate(parsed, resolvedPath);
}
