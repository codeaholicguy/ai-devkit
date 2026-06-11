import fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { GlobalDevKitConfig } from '../types.js';
import { filterStringRecord } from '../util/config.js';
import { ui } from '../util/terminal-ui.js';

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

  async getPlugins(): Promise<string[]> {
    const config = await this.read();
    return normalizePlugins(config?.plugins);
  }

  async addPlugin(pluginName: string): Promise<GlobalDevKitConfig> {
    const config = await this.read() ?? {};
    const plugins = normalizePlugins(config.plugins);

    if (!plugins.includes(pluginName)) {
      plugins.push(pluginName);
    }

    return this.write({
      ...config,
      plugins
    });
  }

  async removePlugin(pluginName: string): Promise<GlobalDevKitConfig> {
    const config = await this.read() ?? {};
    const plugins = normalizePlugins(config.plugins).filter(plugin => plugin !== pluginName);

    return this.write({
      ...config,
      plugins
    });
  }

  private getGlobalConfigPath(): string {
    return path.join(os.homedir(), '.ai-devkit', '.ai-devkit.json');
  }

  private async write(config: GlobalDevKitConfig): Promise<GlobalDevKitConfig> {
    await fs.ensureDir(path.dirname(this.getGlobalConfigPath()));
    await fs.writeJson(this.getGlobalConfigPath(), config, { spaces: 2 });
    return config;
  }
}

function normalizePlugins(rawPlugins: unknown): string[] {
  if (!Array.isArray(rawPlugins)) {
    return [];
  }

  return [...new Set(rawPlugins
    .filter((plugin): plugin is string => typeof plugin === 'string')
    .map(plugin => plugin.trim())
    .filter(plugin => plugin.length > 0))];
}
