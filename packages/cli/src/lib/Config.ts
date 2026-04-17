import * as fs from 'fs-extra';
import * as path from 'path';
import { DevKitConfig, Phase, EnvironmentCode, ConfigSkill, SkillsConfig, DEFAULT_DOCS_DIR } from '../types';
import packageJson from '../../package.json';

const CONFIG_FILE_NAME = '.ai-devkit.json';

export class ConfigManager {
  private configPath: string;

  constructor(targetDir: string = process.cwd()) {
    this.configPath = path.join(targetDir, CONFIG_FILE_NAME);
  }

  async exists(): Promise<boolean> {
    return fs.pathExists(this.configPath);
  }

  async read(): Promise<DevKitConfig | null> {
    if (await this.exists()) {
      const raw = await fs.readJson(this.configPath);
      if (!raw) {
        return null;
      }
      return raw as DevKitConfig;
    }
    return null;
  }

  async create(): Promise<DevKitConfig> {
    const config: DevKitConfig = {
      version: packageJson.version,
      environments: [],
      phases: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await fs.writeJson(this.configPath, config, { spaces: 2 });
    return config;
  }

  async update(updates: Partial<DevKitConfig>): Promise<DevKitConfig> {
    const config = await this.read();
    if (!config) {
      throw new Error('Config file not found. Run ai-devkit init first.');
    }

    const updated = {
      ...config,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await fs.writeJson(this.configPath, updated, { spaces: 2 });
    return updated;
  }

  async addPhase(phase: Phase): Promise<DevKitConfig> {
    const config = await this.read();
    if (!config) {
      throw new Error('Config file not found. Run ai-devkit init first.');
    }

    const phases = Array.isArray(config.phases) ? config.phases : [];
    if (!phases.includes(phase)) {
      phases.push(phase);
      return this.update({ phases });
    }

    return config;
  }

  async hasPhase(phase: Phase): Promise<boolean> {
    const config = await this.read();
    if (!config) {
      return false;
    }

    return Array.isArray(config.phases) && config.phases.includes(phase);
  }

  async getDocsDir(): Promise<string> {
    const config = await this.read();
    return config?.paths?.docs || DEFAULT_DOCS_DIR;
  }

  async getMemoryDbPath(): Promise<string | undefined> {
    const config = await this.read() as any;
    const configuredPath = config?.memory?.path;

    if (typeof configuredPath !== 'string') {
      return undefined;
    }

    const trimmedPath = configuredPath.trim();
    if (!trimmedPath) {
      return undefined;
    }

    if (path.isAbsolute(trimmedPath)) {
      return trimmedPath;
    }

    return path.resolve(path.dirname(this.configPath), trimmedPath);
  }

  async setDocsDir(docsDir: string): Promise<DevKitConfig> {
    const config = await this.read();
    if (!config) {
      throw new Error('Config file not found. Run ai-devkit init first.');
    }
    return this.update({ paths: { ...config.paths, docs: docsDir } });
  }

  async getEnvironments(): Promise<EnvironmentCode[]> {
    const config = await this.read();
    return config?.environments || [];
  }

  async setEnvironments(environments: EnvironmentCode[]): Promise<DevKitConfig> {
    return this.update({ environments });
  }

  async hasEnvironment(envId: EnvironmentCode): Promise<boolean> {
    const environments = await this.getEnvironments();
    return environments.includes(envId);
  }

  normalizeSkillsConfig(raw: unknown): SkillsConfig {
    if (Array.isArray(raw)) {
      return { installed: raw };
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const obj = raw as Record<string, unknown>;
      return {
        registries: obj.registries as Record<string, string> | undefined,
        installed: Array.isArray(obj.installed) ? obj.installed as ConfigSkill[] : []
      };
    }
    return { installed: [] };
  }

  async addSkill(skill: ConfigSkill): Promise<DevKitConfig> {
    const config = await this.read();
    if (!config) {
      throw new Error('Config file not found. Run ai-devkit init first.');
    }

    const normalized = this.normalizeSkillsConfig(config.skills);
    const installed = normalized.installed || [];

    const exists = installed.some(
      entry => entry.registry === skill.registry && entry.name === skill.name
    );

    if (exists) {
      return config;
    }

    installed.push(skill);
    normalized.installed = installed;
    return this.update({ skills: normalized });
  }

  async removeSkill(skillName: string): Promise<DevKitConfig> {
    const config = await this.read();
    if (!config) {
      throw new Error('Config file not found. Run ai-devkit init first.');
    }

    const normalized = this.normalizeSkillsConfig(config.skills);
    const installed = normalized.installed || [];

    normalized.installed = installed.filter(entry => entry.name !== skillName);
    return this.update({ skills: normalized });
  }

  async getSkillRegistries(): Promise<Record<string, string>> {
    const config = await this.read();
    if (!config) {
      return {};
    }

    const normalized = this.normalizeSkillsConfig(config.skills);
    const registries = normalized.registries;

    if (!registries || typeof registries !== 'object' || Array.isArray(registries)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(registries).filter(([, value]) => typeof value === 'string')
    ) as Record<string, string>;
  }

  getInstalledSkills(config: DevKitConfig): ConfigSkill[] {
    return this.normalizeSkillsConfig(config.skills).installed || [];
  }
}
