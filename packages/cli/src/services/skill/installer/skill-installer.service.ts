import fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ConfigManager } from '../../../lib/Config.js';
import { SkillRegistryService, SKILL_CACHE_DIR } from '../registry/skill-registry.service.js';
import { getAllEnvironments, getGlobalSkillPath, getSkillCapableEnvironments, getSkillPath, validateEnvironmentCodes } from '../../../util/env.js';
import { validateRegistryId, validateSkillName, isValidSkillName } from '../skill-validation.js';
import { parseLocalRegistryPath } from '../registry/skill-registry-source.js';
import { discoverRegistrySkills, resolveContainedSkill } from '../registry/registry-skill-discovery.js';
import { ConfigNotFoundError, NotFoundError, ValidationError } from '../../../util/errors.js';
import type { EnvironmentCode } from '../../../types.js';
import type { AddSkillOptions, GlobalInstalledSkill, InstalledSkill, RegistrySkillChoice, RemoveSkillOptions, SkillInstallItem, SkillInstallResult, SkillRemoveResult } from '../skill.types.js';

interface ResolvedInstallTargets {
  targets: string[];
  capableEnvironments: string[];
}

interface ResolvedInstallContext extends ResolvedInstallTargets {
  baseDir: string;
  installMode: 'global' | 'project';
}

export class SkillInstallerService {
  constructor(
    private configManager: ConfigManager,
    private registry: SkillRegistryService,
  ) { }

  /**
   * Add a skill to the project
   */
  async addSkill(
    registryId: string,
    skillName: string,
    options: AddSkillOptions = {}
  ): Promise<SkillInstallResult> {
    if (!skillName) {
      throw new ValidationError('Skill name is required. Re-run with: ai-devkit skill add <registry> <skill-name>');
    }

    return this.addSkills(registryId, [skillName], options);
  }

  async addSkills(
    registryId: string,
    skillNames: string[],
    options: AddSkillOptions = {}
  ): Promise<SkillInstallResult> {
    if (skillNames.length === 0) {
      throw new ValidationError('At least one skill name is required.');
    }

    validateRegistryId(registryId);
    const { repoPath, isLocal } = await this.prepareInstallableRegistry(registryId);
    const selectedEnvironments = await this.resolveInstallEnvironments(options);
    const installContext = this.buildInstallContext(selectedEnvironments, options);

    let status: 'installed' | 'matched' = 'matched';
    const items: SkillInstallItem[] = [];
    for (const resolvedSkillName of skillNames) {
      const result = await this.installResolvedSkill(
        registryId, repoPath, resolvedSkillName, options, installContext, isLocal
      );
      items.push(...result.items);
      if (result.status === 'installed') {
        status = 'installed';
      }
    }

    return {
      status,
      registryId,
      installMode: installContext.installMode,
      environments: installContext.capableEnvironments,
      items,
    };
  }

  async listInstallableSkills(registryId: string): Promise<RegistrySkillChoice[]> {
    validateRegistryId(registryId);
    const { repoPath } = await this.prepareInstallableRegistry(registryId);

    const skillsDir = path.join(repoPath, 'skills');
    if (!await fs.pathExists(skillsDir)) {
      throw new NotFoundError(`No valid skills found in ${registryId}.`, { registryId });
    }

    const skills = await discoverRegistrySkills(registryId, repoPath);
    if (skills.length === 0) {
      throw new NotFoundError(`No valid skills found in ${registryId}.`, { registryId });
    }

    return skills.map(skill => ({
      name: skill.name,
      description: skill.description,
    }));
  }

  private async prepareInstallableRegistry(registryId: string): Promise<{ repoPath: string; isLocal: boolean }> {
    const registry = await this.registry.fetchMergedRegistry();

    const gitUrl = registry.registries[registryId];
    const cachedPath = path.join(SKILL_CACHE_DIR, registryId);
    if (!gitUrl && !await fs.pathExists(cachedPath)) {
      throw new NotFoundError(
        `Registry "${registryId}" not found.`, { registryId }
      );
    }

    const repoPath = await this.registry.prepareRegistryRepository(registryId, gitUrl);
    const isLocal = Boolean(gitUrl && parseLocalRegistryPath(gitUrl) !== null);

    return { repoPath, isLocal };
  }

  /**
   * List installed skills in the project
   */
  async listSkills(): Promise<InstalledSkill[]> {
    const skills: InstalledSkill[] = [];
    const seenSkills = new Set<string>();

    const config = await this.configManager.read();
    if (!config || !config.environments || config.environments.length === 0) {
      return [];
    }

    const { targets, capableEnvironments } = resolveInstallationTargets(config.environments);

    for (const targetDir of targets) {
      const fullPath = path.join(process.cwd(), targetDir);

      if (!await fs.pathExists(fullPath)) {
        continue;
      }

      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          const skillName = entry.name;

          if (!seenSkills.has(skillName)) {
            seenSkills.add(skillName);

            const skillPath = path.join(fullPath, skillName);
            let registry = 'unknown';

            try {
              const realPath = await fs.realpath(skillPath);
              const cacheRelative = path.relative(SKILL_CACHE_DIR, realPath);
              const parts = cacheRelative.split(path.sep);
              const insideCache = cacheRelative
                && cacheRelative !== '..'
                && !cacheRelative.startsWith(`..${path.sep}`)
                && !path.isAbsolute(cacheRelative);
              if (insideCache && parts.length >= 2) {
                registry = `${parts[0]}/${parts[1]}`;
              }
            } catch {
              // Ignore errors
            }

            skills.push({
              name: skillName,
              registry,
              environments: capableEnvironments,
            });
          }
        }
      }
    }

    return skills;
  }

  /**
   * List valid skills installed in known global environment paths.
   */
  async listGlobalSkills(envCodes?: string[]): Promise<GlobalInstalledSkill[]> {
    const selectedCodes = envCodes && envCodes.length > 0
      ? new Set(validateEnvironmentCodes(envCodes))
      : undefined;
    const roots = new Map<string, { path: string; environments: string[] }>();

    for (const environment of getAllEnvironments()) {
      if (!environment.globalSkillPath || (selectedCodes && !selectedCodes.has(environment.code as EnvironmentCode))) {
        continue;
      }

      const fullPath = path.join(os.homedir(), environment.globalSkillPath);
      const existing = roots.get(fullPath);
      if (existing) {
        if (!existing.environments.includes(environment.code)) {
          existing.environments.push(environment.code);
        }
      } else {
        roots.set(fullPath, {
          path: environment.globalSkillPath,
          environments: [environment.code],
        });
      }
    }

    const skills: GlobalInstalledSkill[] = [];
    for (const [fullPath, root] of roots) {
      if (!await fs.pathExists(fullPath)) {
        continue;
      }

      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        if ((!entry.isDirectory() && !entry.isSymbolicLink()) || !isValidSkillName(entry.name)) {
          continue;
        }

        const skillPath = path.join(fullPath, entry.name);
        if (!await fs.pathExists(path.join(skillPath, 'SKILL.md'))) {
          continue;
        }

        skills.push({
          name: entry.name,
          environments: [...root.environments],
          path: `~/${path.join(root.path, entry.name).split(path.sep).join('/')}`,
        });
      }
    }

    return skills.sort((left, right) =>
      left.name.localeCompare(right.name) || left.path.localeCompare(right.path),
    );
  }

  /**
   * Remove a skill from the project
   */
  async removeSkill(skillName: string, options: RemoveSkillOptions = {}): Promise<SkillRemoveResult> {
    validateSkillName(skillName);

    if (options.environments && options.environments.length > 0 && !options.global) {
      throw new ValidationError('--env can only be used with --global');
    }

    if (options.global) {
      return this.removeGlobalSkill(skillName, options.environments);
    }

    return this.removeProjectSkill(skillName);
  }

  private async removeProjectSkill(skillName: string): Promise<SkillRemoveResult> {
    const config = await this.configManager.read();
    if (!config || !config.environments || config.environments.length === 0) {
      throw new ConfigNotFoundError('No .ai-devkit.json found. Run: ai-devkit init');
    }

    const { targets } = resolveInstallationTargets(config.environments);
    const removedTargets: string[] = [];

    for (const targetDir of targets) {
      const skillPath = path.join(process.cwd(), targetDir, skillName);

      if (await fs.pathExists(skillPath)) {
        await fs.remove(skillPath);
        removedTargets.push(targetDir);
      }
    }

    if (removedTargets.length > 0) {
      await this.configManager.removeSkill(skillName);
    }

    return {
      skillName,
      scope: 'project',
      removedTargets,
      failures: [],
    };
  }

  private async removeGlobalSkill(skillName: string, envCodes?: string[]): Promise<SkillRemoveResult> {
    const environments: EnvironmentCode[] = envCodes && envCodes.length > 0
      ? validateEnvironmentCodes(envCodes)
      : getAllEnvironments()
        .filter(env => env.globalSkillPath !== undefined)
        .map(env => env.code as EnvironmentCode);
    const unsupported = environments.filter(env => getGlobalSkillPath(env) === undefined);

    if (unsupported.length > 0) {
      throw new ValidationError(`Global skill removal is not supported for: ${unsupported.join(', ')}`);
    }

    const homeDir = path.resolve(os.homedir());
    const targets = new Map<string, string>();

    for (const environment of environments) {
      const configuredRoot = getGlobalSkillPath(environment);
      if (!configuredRoot) {
        continue;
      }

      const rootPath = path.resolve(homeDir, configuredRoot);
      const relativeRoot = path.relative(homeDir, rootPath);
      if (path.isAbsolute(configuredRoot)
        || relativeRoot === '..'
        || relativeRoot.startsWith(`..${path.sep}`)) {
        throw new ValidationError(`Unsafe global skill root configured for: ${environment}`);
      }

      const skillPath = path.resolve(rootPath, skillName);
      if (path.dirname(skillPath) !== rootPath) {
        throw new ValidationError(`Refusing to remove skill outside configured global skill root: ${environment}`);
      }

      targets.set(skillPath, configuredRoot);
    }

    const removedTargets: string[] = [];
    const failures: string[] = [];

    for (const [skillPath, configuredRoot] of targets) {
      try {
        await fs.lstat(skillPath);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue;
        }
        failures.push(`${configuredRoot}: ${(error as Error).message}`);
        continue;
      }

      try {
        await fs.remove(skillPath);
        removedTargets.push(`~/${configuredRoot}`);
      } catch (error: unknown) {
        failures.push(`${configuredRoot}: ${(error as Error).message}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`Failed to remove skill from ${failures.length} location(s): ${failures.join('; ')}`);
    }

    return {
      skillName,
      scope: 'global',
      removedTargets,
      failures,
    };
  }

  /**
   * Update skills from registries
   */
  private async resolveProjectEnvironments(): Promise<string[]> {
    let config = await this.configManager.read();
    if (!config) {
      config = await this.configManager.create();
    }

    if (!config.environments || config.environments.length === 0) {
      throw new ConfigNotFoundError('No environments configured. Run "ai-devkit init" or add "environments" in .ai-devkit.json.');
    }

    return config.environments;
  }

  private async resolveGlobalEnvironments(envCodes?: string[]): Promise<string[]> {
    if (!envCodes || envCodes.length === 0) {
      throw new ValidationError('Global skill installation requires at least one environment.');
    }

    const validCodes = validateEnvironmentCodes(envCodes);
    const unsupported = validCodes.filter(env => getGlobalSkillPath(env) === undefined);
    if (unsupported.length > 0) {
      throw new ValidationError(`Global skill installation is not supported for: ${unsupported.join(', ')}`);
    }

    return validCodes;
  }

  private async resolveInstallEnvironments(options: AddSkillOptions): Promise<string[]> {
    if (options.global) {
      return await this.resolveGlobalEnvironments(options.environments);
    }

    if (options.environments && options.environments.length > 0) {
      return options.environments;
    }

    return await this.resolveProjectEnvironments();
  }

  private async installResolvedSkill(
    registryId: string,
    repoPath: string,
    resolvedSkillName: string,
    options: AddSkillOptions,
    installContext: ResolvedInstallContext,
    isLocal: boolean,
  ): Promise<{ status: 'installed' | 'matched'; items: SkillInstallItem[] }> {
    validateSkillName(resolvedSkillName);

    const skillPath = isLocal
      ? await resolveContainedSkill(registryId, repoPath, resolvedSkillName)
      : await this.resolveInstallableSkillPath(repoPath, registryId, resolvedSkillName);

    let installed = false;
    const items: SkillInstallItem[] = [];
    for (const targetDir of installContext.targets) {
      const targetPath = path.join(installContext.baseDir, targetDir, resolvedSkillName);

      if (await fs.pathExists(targetPath)) {
        items.push({
          skillName: resolvedSkillName,
          target: `${targetDir}/${resolvedSkillName}`,
          action: 'skipped',
        });
        continue;
      }

      await fs.ensureDir(path.dirname(targetPath));

      try {
        await fs.symlink(skillPath, targetPath, 'dir');
        items.push({
          skillName: resolvedSkillName,
          target: `${targetDir}/${resolvedSkillName}`,
          action: 'symlinked',
        });
      } catch (ignoreError) {
        await fs.copy(skillPath, targetPath);
        items.push({
          skillName: resolvedSkillName,
          target: `${targetDir}/${resolvedSkillName}`,
          action: 'copied',
        });
      }
      installed = true;
    }

    if (!options.global) {
      await this.configManager.addSkill({
        registry: registryId,
        name: resolvedSkillName
      });
    }

    return {
      status: installed ? 'installed' : 'matched',
      items,
    };
  }

  private buildInstallContext(
    selectedEnvironments: string[],
    options: AddSkillOptions
  ): ResolvedInstallContext {
    const { targets, capableEnvironments } = resolveInstallationTargets(selectedEnvironments, options.global);

    return {
      baseDir: options.global ? os.homedir() : process.cwd(),
      capableEnvironments,
      installMode: options.global ? 'global' : 'project',
      targets,
    };
  }

  private async resolveInstallableSkillPath(
    repoPath: string,
    registryId: string,
    resolvedSkillName: string
  ): Promise<string> {
    const skillPath = path.join(repoPath, 'skills', resolvedSkillName);
    if (!await fs.pathExists(skillPath)) {
      throw new NotFoundError(
        `Skill "${resolvedSkillName}" not found in ${registryId}. Check the repository for available skills.`,
        { skillName: resolvedSkillName, registryId }
      );
    }

    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (!await fs.pathExists(skillMdPath)) {
      throw new NotFoundError(
        `Invalid skill: SKILL.md not found in ${resolvedSkillName}. This may not be a valid Agent Skill.`,
        { skillName: resolvedSkillName }
      );
    }

    return skillPath;
  }

}

function resolveInstallationTargets(
  environments: string[],
  isGlobal = false,
): ResolvedInstallTargets {
  const targets: string[] = [];
  const capableEnvironments: string[] = [];

  for (const env of environments) {
    const skillPath = isGlobal ? getGlobalSkillPath(env as EnvironmentCode) : getSkillPath(env as EnvironmentCode);
    if (skillPath) {
      targets.push(skillPath);
      capableEnvironments.push(env);
    }
  }

  if (targets.length === 0) {
    if (isGlobal) {
      throw new ValidationError('No global-skill-capable environments configured.');
    }
    const supported = getSkillCapableEnvironments().map(env => env.code).join(', ');
    throw new ValidationError(`No skill-capable environments configured. Supported: ${supported}`);
  }

  return { targets, capableEnvironments };
}
