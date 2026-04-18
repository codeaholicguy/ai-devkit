import { z } from 'zod';
import { ConfigSkill, EnvironmentCode, McpServerDefinition, Phase, AVAILABLE_PHASES } from '../types';
import { isValidEnvironmentCode } from './env';

export interface InstallConfigData {
  environments: EnvironmentCode[];
  phases: Phase[];
  registries: Record<string, string>;
  skills: ConfigSkill[];
  mcpServers: Record<string, McpServerDefinition>;
}

const skillEntrySchema = z.object({
  registry: z.string().trim().min(1, 'registry must be a non-empty string'),
  name: z.string().trim().min(1).optional(),
  skill: z.string().trim().min(1).optional()
}).transform((entry, ctx): ConfigSkill => {
  const resolvedName = entry.name ?? entry.skill;
  if (!resolvedName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['name'],
      message: 'requires a non-empty "name" field'
    });
    return z.NEVER;
  }

  return {
    registry: entry.registry,
    name: resolvedName
  };
});

const installConfigSchema = z.object({
  paths: z.object({
    docs: z.string().trim().min(1).optional()
  }).optional(),
  environments: z.array(z.string()).optional().default([]).superRefine((values, ctx) => {
    values.forEach((value, index) => {
      if (!isValidEnvironmentCode(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: `has unsupported value "${value}"`
        });
      }
    });
  }).transform(values => dedupe(values) as EnvironmentCode[]),
  phases: z.array(z.string()).optional(),
  registries: z.record(z.string(), z.string()).optional().default({}),
  skills: z.array(skillEntrySchema).optional().default([]),
  mcpServers: z.record(z.string(), z.object({
    transport: z.enum(['stdio', 'http', 'sse']),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  })).optional().default({})
}).transform((data, ctx) => {
  const phaseValues = data.phases ?? [];

  phaseValues.forEach((value, index) => {
    if (!AVAILABLE_PHASES.includes(value as Phase)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phases', index],
        message: `has unsupported value "${value}"`
      });
    }
  });

  return {
    environments: data.environments,
    phases: dedupe(phaseValues) as Phase[],
    registries: data.registries,
    skills: dedupeSkills(data.skills),
    mcpServers: data.mcpServers as Record<string, McpServerDefinition>
  };
});

export function validateInstallConfig(data: unknown, configPath: string): InstallConfigData {
  const parsed = installConfigSchema.safeParse(data);

  if (!parsed.success) {
    throw new Error(`Invalid config file ${configPath}: ${formatZodIssue(parsed.error)}`);
  }

  return parsed.data;
}

function formatZodIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return 'validation failed';
  }

  if (issue.code === z.ZodIssueCode.invalid_type && issue.path.length === 0) {
    return 'expected a JSON object at root';
  }

  if (issue.path.length === 0) {
    return issue.message;
  }

  return `${formatPath(issue.path)} ${issue.message}`;
}

function formatPath(pathParts: Array<string | number>): string {
  const [first, ...rest] = pathParts;
  let result = String(first);

  for (const part of rest) {
    if (typeof part === 'number') {
      result += `[${part}]`;
    } else {
      result += `.${part}`;
    }
  }

  return result;
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function filterStringRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(raw).filter(([, value]) => typeof value === 'string')
  );
}

function dedupeSkills(skills: ConfigSkill[]): ConfigSkill[] {
  const unique = new Map<string, ConfigSkill>();

  for (const skill of skills) {
    unique.set(`${skill.registry}::${skill.name}`, skill);
  }

  return [...unique.values()];
}
