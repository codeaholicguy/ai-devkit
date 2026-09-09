import { ConfigManager } from '../../lib/Config.js';
import { GlobalConfigManager } from '../../lib/GlobalConfig.js';
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
  SkillInstallResult,
  SkillRemoveResult,
} from './skill.types.js';
import type { SkillEntry } from './index/skill-index.service.js';
import type { SkillRegistryAddStatus } from './registry/skill-registry-source.js';
import type { UpdateSummary } from './registry/skill-registry.service.js';
import type { SkillIndexRebuildResult } from './index/skill-index.service.js';

export class SkillService {
  private readonly installer: SkillInstallerService;
  private readonly registry: SkillRegistryService;
  private readonly index: SkillIndexService;

  constructor(
    configManager: ConfigManager,
    globalConfigManager: GlobalConfigManager = new GlobalConfigManager(),
  ) {
    this.registry = new SkillRegistryService(configManager, globalConfigManager);
    this.index = new SkillIndexService(this.registry);
    this.installer = new SkillInstallerService(configManager, this.registry);
  }

  addSkill(
    registryId: string,
    skillName: string,
    options: AddSkillOptions = {},
  ): Promise<SkillInstallResult> {
    return this.installer.addSkill(registryId, skillName, options);
  }

  addSkills(
    registryId: string,
    skillNames: string[],
    options: AddSkillOptions = {},
  ): Promise<SkillInstallResult> {
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

  removeSkill(skillName: string, options: RemoveSkillOptions = {}): Promise<SkillRemoveResult> {
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

  rebuildIndex(outputPath?: string): Promise<SkillIndexRebuildResult> {
    return this.index.rebuildIndex(outputPath);
  }
}
