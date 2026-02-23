import * as fs from 'fs-extra';
import * as path from 'path';
import { DevKitConfig, Phase, EnvironmentCode, ConfigSkill } from '../types';
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

    const phases = config.phases;
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

    return config.phases.includes(phase);
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
}
