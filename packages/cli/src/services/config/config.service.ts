import * as fs from 'fs-extra';
import * as path from 'path';

export interface LoadedConfigFile {
  configPath: string;
  data: unknown;
}

export async function loadConfigFile(configPath: string): Promise<LoadedConfigFile> {
  const resolvedPath = path.resolve(configPath);

  if (!await fs.pathExists(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }

  try {
    const data = await fs.readJson(resolvedPath);
    return {
      configPath: resolvedPath,
      data
    };
  } catch (error) {
    throw new Error(
      `Invalid JSON in config file ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
