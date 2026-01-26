import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { GlobalDevKitConfig } from '../types';

export class GlobalConfigManager {
  async exists(): Promise<boolean> {
    return fs.pathExists(this.getGlobalConfigPath());
  }

  async read(): Promise<GlobalDevKitConfig | null> {
    if (!await this.exists()) {
      return null;
    }

    try {
      return await fs.readJson(this.getGlobalConfigPath());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Warning: Failed to read global config at ${this.getGlobalConfigPath()}. ${message}`);
      return null;
    }
  }

  async getSkillRegistries(): Promise<Record<string, string>> {
    const config = await this.read();
    const registries = config?.skills?.registries;

    if (!registries || typeof registries !== 'object' || Array.isArray(registries)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(registries).filter(([, value]) => typeof value === 'string')
    );
  }

  private getGlobalConfigPath(): string {
    return path.join(os.homedir(), '.ai-devkit', '.ai-devkit.json');
  }
}
