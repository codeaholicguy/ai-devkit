import { constants } from 'node:fs';
import { access as fsAccess } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { ENVIRONMENT_DEFINITIONS } from '../../util/env.js';

const PROVIDER_NAMES: Record<string, string> = { github: 'copilot' };

type DetectionOptions = {
  homeDir?: string;
  exists?: (path: string) => Promise<boolean>;
};

type BinaryOptions = {
  path?: string;
  access?: (path: string) => Promise<void>;
};

function configDirectory(globalSkillPath: string): string {
  const parts = globalSkillPath.split('/').filter(Boolean);
  return parts[0] === '.config' && parts[1] ? path.join(parts[0], parts[1]) : parts[0];
}

async function defaultExists(target: string): Promise<boolean> {
  try {
    await fsAccess(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function detectConfiguredProviders(options: DetectionOptions = {}): Promise<string[]> {
  const home = options.homeDir ?? homedir();
  const exists = options.exists ?? defaultExists;
  const definitions = Object.values(ENVIRONMENT_DEFINITIONS).filter(
    (definition): definition is typeof definition & { globalSkillPath: string } =>
      typeof definition.globalSkillPath === 'string'
  );
  const providers = await Promise.all(definitions.map(async definition => ({
    provider: PROVIDER_NAMES[definition.code] ?? definition.code,
    configured: await exists(path.join(home, configDirectory(definition.globalSkillPath)))
  })));
  return [...new Set(providers.filter(item => item.configured).map(item => item.provider))].sort();
}

export async function isBinaryInstalled(binary: string, options: BinaryOptions = {}): Promise<boolean> {
  const pathValue = options.path ?? process.env.PATH ?? '';
  const access = options.access ?? ((target: string) => fsAccess(target, constants.X_OK));
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    try {
      await access(path.join(directory, binary));
      return true;
    } catch {
      // Continue searching PATH.
    }
  }
  return false;
}
