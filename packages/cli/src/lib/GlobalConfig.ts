import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { GlobalDevKitConfig } from '../types';
import { filterStringRecord } from '../util/config';
import { ui } from '../util/terminal-ui';

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
      ui.warning(`Failed to read global config at ${this.getGlobalConfigPath()}. ${message}`);
      return null;
    }
  }

  async getSkillRegistries(): Promise<Record<string, string>> {
    const config = await this.read();
    return filterStringRecord(config?.registries);
  }

  private getGlobalConfigPath(): string {
    return path.join(os.homedir(), '.ai-devkit', '.ai-devkit.json');
  }
}
