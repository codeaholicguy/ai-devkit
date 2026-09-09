import { ConfigManager } from '../../lib/Config.js';
import { GlobalConfigManager } from '../../lib/GlobalConfig.js';
import { EnvironmentSelector } from '../../lib/EnvironmentSelector.js';
import { SkillInstallerService } from './installer/skill-installer.service.js';
import { SkillIndexService } from './index/skill-index.service.js';
import { SkillRegistryService } from './registry/skill-registry.service.js';
import type {
  AddSkillOptions,
  AddSkillRegistryCommandOptions,
  GlobalInstalledSkill,
  InstalledSkill,
  RegistrySkillChoice,
  RemoveSkillOptions,
  RemoveSkillRegistryCommandOptions,
} from './skill.types.js';
import type { SkillEntry } from './index/skill-index.service.js';
import type { SkillRegistryAddStatus } from './registry/skill-registry-source.js';
import type { UpdateSummary } from './registry/skill-registry.service.js';

export class SkillService {
  private readonly installer: SkillInstallerService;
  private readonly registry: SkillRegistryService;
  private readonly index: SkillIndexService;

  constructor(
    configManager: ConfigManager,
    environmentSelector: EnvironmentSelector = new EnvironmentSelector(),
    globalConfigManager: GlobalConfigManager = new GlobalConfigManager(),
  ) {
    this.registry = new SkillRegistryService(configManager, globalConfigManager);
    this.index = new SkillIndexService(this.registry);
    this.installer = new SkillInstallerService(configManager, this.registry, environmentSelector);
  }

  addSkill(
    registryId: string,
    skillName: string,
    options: AddSkillOptions = {},
  ): Promise<'installed' | 'matched'> {
    return this.installer.addSkill(registryId, skillName, options);
  }

  addSkills(
    registryId: string,
    skillNames: string[],
    options: AddSkillOptions = {},
  ): Promise<'installed' | 'matched'> {
    return this.installer.addSkills(registryId, skillNames, options);
  }

  listInstallableSkills(registryId: string): Promise<RegistrySkillChoice[]> {
    return this.installer.listInstallableSkills(registryId);
  }

  listSkills(): Promise<InstalledSkill[]> {
    return this.installer.listSkills();
  }

  listGlobalSkills(envCodes?: string[]): Promise<GlobalInstalledSkill[]> {
    return this.installer.listGlobalSkills(envCodes);
  }

  removeSkill(skillName: string, options: RemoveSkillOptions = {}): Promise<void> {
    return this.installer.removeSkill(skillName, options);
  }

  async addRegistry(
    id: string,
    source: string,
    options: AddSkillRegistryCommandOptions = {},
  ): Promise<SkillRegistryAddStatus> {
    const result = await this.registry.addRegistrySource(id, source, options);
    if (result.registryPath) {
      await this.index.updateRegistryFromCache(id, result.registryPath);
    }
    return result.status;
  }

  async removeRegistry(
    id: string,
    options: RemoveSkillRegistryCommandOptions = {},
  ): Promise<'project' | 'global'> {
    const scope = await this.registry.removeRegistrySource(id, options);
    await this.index.removeRegistry(id);
    return scope;
  }

  updateSkills(registryId?: string): Promise<UpdateSummary> {
    return this.registry.updateSkills(registryId);
  }

  findSkills(keyword: string, options?: { refresh?: boolean }): Promise<SkillEntry[]> {
    return this.index.findSkills(keyword, options);
  }

  rebuildIndex(outputPath?: string): Promise<void> {
    return this.index.rebuildIndex(outputPath);
  }
}
