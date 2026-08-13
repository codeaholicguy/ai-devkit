import { CliError } from './errors.js';

export interface AddSkillRegistryOptions {
  force?: boolean;
}

export type SkillRegistryAddStatus = 'added' | 'already-registered' | 'updated';

export interface SkillRegistryMutation {
  registries: Record<string, string>;
  status: SkillRegistryAddStatus;
}

export function planSkillRegistryAdd(
  registries: Record<string, string>,
  id: string,
  url: string,
  options: AddSkillRegistryOptions = {},
): SkillRegistryMutation {
  const existingUrl = registries[id];

  if (existingUrl === url) {
    return { registries, status: 'already-registered' };
  }

  if (existingUrl !== undefined && !options.force) {
    throw new CliError(
      `Registry "${id}" is already registered with a different URL. Use --force to overwrite it.`,
      'REGISTRY_CONFLICT',
      { id, existingUrl, requestedUrl: url },
    );
  }

  return {
    registries: { ...registries, [id]: url },
    status: existingUrl === undefined ? 'added' : 'updated',
  };
}
