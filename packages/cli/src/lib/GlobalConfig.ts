import fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { GlobalDevKitConfig } from '../types.js';
import { filterStringRecord } from '../util/config.js';
import { CliError } from '../util/errors.js';
import { AddSkillRegistryOptions, planSkillRegistryAdd, planSkillRegistryRemove } from '../util/skill-registry.js';
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

  async addSkillRegistry(id: string, url: string, options: AddSkillRegistryOptions = {}): Promise<GlobalDevKitConfig> {
    const configExists = await this.exists();
    const config = await this.read();
    if (configExists && !config) {
      throw new CliError(
        `Cannot update global config because the existing file could not be read: ${this.getGlobalConfigPath()}`,
        'GLOBAL_CONFIG_UNREADABLE',
        { configPath: this.getGlobalConfigPath() },
      );
    }

    const existingConfig = config ?? {};
    const registries = filterStringRecord(existingConfig.registries);
    const mutation = planSkillRegistryAdd(registries, id, url, options);
    if (mutation.status === 'already-registered') {
      return existingConfig;
    }

    return this.write({
      ...existingConfig,
      registries: mutation.registries,
    });
  }

  async removeSkillRegistry(id: string): Promise<GlobalDevKitConfig> {
    const configExists = await this.exists();
    const config = await this.read();
    if (configExists && !config) {
      throw new CliError(
        `Cannot update global config because the existing file could not be read: ${this.getGlobalConfigPath()}`,
        'GLOBAL_CONFIG_UNREADABLE',
        { configPath: this.getGlobalConfigPath() },
      );
    }
    const existingConfig = config ?? {};
    const mutation = planSkillRegistryRemove(filterStringRecord(existingConfig.registries), id);
    if (mutation.status === 'not-registered') return existingConfig;
    return this.write({ ...existingConfig, registries: mutation.registries });
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
