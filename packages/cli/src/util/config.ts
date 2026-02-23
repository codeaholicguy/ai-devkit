import { z } from 'zod';
import { ConfigSkill, EnvironmentCode, Phase, AVAILABLE_PHASES } from '../types';
import { isValidEnvironmentCode } from './env';

export interface InstallConfigData {
  environments: EnvironmentCode[];
  phases: Phase[];
  skills: ConfigSkill[];
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
  skills: z.array(skillEntrySchema).optional().default([])
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
    skills: dedupeSkills(data.skills)
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

function dedupeSkills(skills: ConfigSkill[]): ConfigSkill[] {
  const unique = new Map<string, ConfigSkill>();

  for (const skill of skills) {
    unique.set(`${skill.registry}::${skill.name}`, skill);
  }

  return [...unique.values()];
}
