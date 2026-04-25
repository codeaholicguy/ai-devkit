import * as fs from 'fs-extra';
import * as path from 'path';
import { ConfigNotFoundError, ValidationError } from '../../util/errors';

export interface LoadedConfigFile {
  configPath: string;
  data: unknown;
}

export async function loadConfigFile(configPath: string): Promise<LoadedConfigFile> {
  const resolvedPath = path.resolve(configPath);

  if (!await fs.pathExists(resolvedPath)) {
    throw new ConfigNotFoundError(`Config file not found: ${resolvedPath}`, resolvedPath);
  }

  try {
    const data = await fs.readJson(resolvedPath);
    return {
      configPath: resolvedPath,
      data
    };
  } catch (error) {
    throw new ValidationError(
      `Invalid JSON in config file ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`,
      { configPath: resolvedPath }
    );
  }
}
