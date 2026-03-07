import * as fs from 'fs-extra';
import * as path from 'path';
import { DevKitConfig, Phase, EnvironmentCode, ConfigSkill, DEFAULT_DOCS_DIR } from '../types';
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

  async addSkill(skill: ConfigSkill): Promise<DevKitConfig> {
    const config = await this.read();
    if (!config) {
      throw new Error('Config file not found. Run ai-devkit init first.');
    }

    const skills = config.skills || [];
    const exists = skills.some(
      entry => entry.registry === skill.registry && entry.name === skill.name
    );

    if (exists) {
      return config;
    }

    skills.push(skill);
    return this.update({ skills });
  }

  async getSkillRegistries(): Promise<Record<string, string>> {
    const config = await this.read() as any;
    const rootRegistries = config?.registries;
    const nestedRegistries =
      config?.skills && !Array.isArray(config.skills)
        ? config.skills.registries
        : undefined;

    const registries = rootRegistries ?? nestedRegistries;

    if (!registries || typeof registries !== 'object' || Array.isArray(registries)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(registries).filter(([, value]) => typeof value === 'string')
    ) as Record<string, string>;
  }
}
