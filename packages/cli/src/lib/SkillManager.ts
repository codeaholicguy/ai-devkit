import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import inquirer from 'inquirer';
import { ConfigManager } from './Config';
import { GlobalConfigManager } from './GlobalConfig';
import { EnvironmentSelector } from './EnvironmentSelector';
import { SkillRegistry, SKILL_CACHE_DIR } from './SkillRegistry';
import { SkillIndex } from './SkillIndex';
import { getGlobalSkillPath, getSkillPath, validateEnvironmentCodes } from '../util/env';
import { ensureGitInstalled } from '../util/git';
import { validateRegistryId, validateSkillName, extractSkillDescription, isValidSkillName } from '../util/skill';
import { isInteractiveTerminal } from '../util/terminal';
import { ui } from '../util/terminal-ui';
import { ConfigNotFoundError, NotFoundError, ValidationError } from '../util/errors';

import type { UpdateSummary } from './SkillRegistry';
import type { SkillEntry } from './SkillIndex';

interface InstalledSkill {
  name: string;
  registry: string;
  environments: string[];
}

interface AddSkillOptions {
  global?: boolean;
  environments?: string[];
}

interface RegistrySkillChoice {
  name: string;
  description?: string;
}

interface ResolvedInstallContext {
  baseDir: string;
  capableEnvironments: string[];
  installMode: 'global' | 'project';
  targets: string[];
}

export class SkillManager {
  private registry: SkillRegistry;
  private index: SkillIndex;

  constructor(
    private configManager: ConfigManager,
    private environmentSelector: EnvironmentSelector = new EnvironmentSelector(),
    private globalConfigManager: GlobalConfigManager = new GlobalConfigManager()
  ) {
    this.registry = new SkillRegistry(configManager, globalConfigManager);
    this.index = new SkillIndex(this.registry);
  }

  /**
   * Add a skill to the project
   */
  async addSkill(registryId: string, skillName?: string, options: AddSkillOptions = {}): Promise<void> {
    ui.info(`Validating registry: ${registryId}`);
    validateRegistryId(registryId);
    await ensureGitInstalled();

    const spinner = ui.spinner('Fetching registries...');
    spinner.start();
    const registry = await this.registry.fetchMergedRegistry();
    spinner.succeed('Registries fetched');

    const gitUrl = registry.registries[registryId];
    const cachedPath = path.join(SKILL_CACHE_DIR, registryId);
    if (!gitUrl && !await fs.pathExists(cachedPath)) {
      throw new NotFoundError(
        `Registry "${registryId}" not found.`, { registryId }
      );
    }

    ui.info('Checking local cache...');
    const repoPath = await this.registry.prepareRegistryRepository(registryId, gitUrl);

    const resolvedSkillNames = skillName
      ? [skillName]
      : await this.resolveSkillNamesFromRegistry(registryId, repoPath);
    const selectedEnvironments = await this.resolveInstallEnvironments(options);
    const installContext = this.buildInstallContext(selectedEnvironments, options);

    for (const resolvedSkillName of resolvedSkillNames) {
      await this.installResolvedSkill(registryId, repoPath, resolvedSkillName, options, installContext);
    }
  }

  /**
   * List installed skills in the project
   */
  async listSkills(): Promise<InstalledSkill[]> {
    const skills: InstalledSkill[] = [];
    const seenSkills = new Set<string>();

    const config = await this.configManager.read();
    if (!config || !config.environments || config.environments.length === 0) {
      ui.warning('No .ai-devkit.json found or no environments configured.');
      return [];
    }

    const { targets, capableEnvironments } = this.resolveInstallationTargets(config.environments);

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
              if (parts.length >= 2) {
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
   * Remove a skill from the project
   */
  async removeSkill(skillName: string): Promise<void> {
    ui.info(`Removing skill: ${skillName}`);
    validateSkillName(skillName);

    const config = await this.configManager.read();
    if (!config || !config.environments || config.environments.length === 0) {
      throw new ConfigNotFoundError('No .ai-devkit.json found. Run: ai-devkit init');
    }

    const { targets } = this.resolveInstallationTargets(config.environments);
    let removedCount = 0;

    for (const targetDir of targets) {
      const skillPath = path.join(process.cwd(), targetDir, skillName);

      if (await fs.pathExists(skillPath)) {
        await fs.remove(skillPath);
        ui.text(`  → Removed from ${targetDir}`);
        removedCount++;
      }
    }

    if (removedCount === 0) {
      ui.warning(`Skill "${skillName}" not found. Nothing to remove.`);
      ui.info('Tip: Run "ai-devkit skill list" to see installed skills.');
    } else {
      await this.configManager.removeSkill(skillName);
      ui.success(`Successfully removed from ${removedCount} location(s).`);
      ui.info(`Note: Cached copy in ~/.ai-devkit/skills/ preserved for other projects.`);
    }
  }

  /**
   * Update skills from registries
   */
  async updateSkills(registryId?: string): Promise<UpdateSummary> {
    return this.registry.updateSkills(registryId);
  }

  /**
   * Find skills by keyword across all registries
   */
  async findSkills(keyword: string, options?: { refresh?: boolean }): Promise<SkillEntry[]> {
    return this.index.findSkills(keyword, options);
  }

  /**
   * Rebuild skill index
   */
  async rebuildIndex(outputPath?: string): Promise<void> {
    return this.index.rebuildIndex(outputPath);
  }

  private async resolveProjectEnvironments(): Promise<string[]> {
    ui.info('Loading project configuration...');
    let config = await this.configManager.read();
    if (!config) {
      ui.info('No .ai-devkit.json found. Creating configuration...');
      config = await this.configManager.create();
    }

    if (!config.environments || config.environments.length === 0) {
      if (!isInteractiveTerminal()) {
        throw new ConfigNotFoundError('No environments configured. Run "ai-devkit init" or add "environments" in .ai-devkit.json.');
      }

      const selectedEnvs = await this.environmentSelector.selectSkillEnvironments();
      config.environments = selectedEnvs;
      await this.configManager.update({ environments: selectedEnvs });
      ui.success('Configuration saved.');
    }

    return config.environments;
  }

  private async resolveGlobalEnvironments(envCodes?: string[]): Promise<string[]> {
    if (!envCodes || envCodes.length === 0) {
      return await this.environmentSelector.selectGlobalSkillEnvironments();
    }

    const validCodes = validateEnvironmentCodes(envCodes);
    const unsupported = validCodes.filter(env => getGlobalSkillPath(env) === undefined);
    if (unsupported.length > 0) {
      throw new ValidationError(`Global skill installation is not supported for: ${unsupported.join(', ')}`);
    }

    return validCodes;
  }

  private async resolveInstallEnvironments(options: AddSkillOptions): Promise<string[]> {
    if (options.environments && options.environments.length > 0 && !options.global) {
      throw new ValidationError('--env can only be used with --global');
    }

    if (options.global) {
      return await this.resolveGlobalEnvironments(options.environments);
    }

    return await this.resolveProjectEnvironments();
  }

  private resolveInstallationTargets(
    environments: string[],
    isGlobal = false
  ): { targets: string[]; capableEnvironments: string[] } {
    const targets: string[] = [];
    const capableEnvironments: string[] = [];

    for (const env of environments) {
      const skillPath = isGlobal ? getGlobalSkillPath(env as any) : getSkillPath(env as any);
      if (skillPath) {
        targets.push(skillPath);
        capableEnvironments.push(env);
      }
    }

    if (targets.length === 0) {
      if (isGlobal) {
        throw new ValidationError('No global-skill-capable environments configured.');
      }
      throw new ValidationError('No skill-capable environments configured. Supported: cursor, claude');
    }

    return { targets, capableEnvironments };
  }

  private async installResolvedSkill(
    registryId: string,
    repoPath: string,
    resolvedSkillName: string,
    options: AddSkillOptions,
    installContext: ResolvedInstallContext
  ): Promise<void> {
    ui.info(`Validating skill: ${resolvedSkillName} from ${registryId}`);
    validateSkillName(resolvedSkillName);

    const skillPath = await this.resolveInstallableSkillPath(repoPath, registryId, resolvedSkillName);

    ui.info(`Installing skill to ${installContext.installMode}...`);
    for (const targetDir of installContext.targets) {
      const targetPath = path.join(installContext.baseDir, targetDir, resolvedSkillName);

      if (await fs.pathExists(targetPath)) {
        ui.text(`  → ${targetDir}/${resolvedSkillName} (already exists, skipped)`);
        continue;
      }

      await fs.ensureDir(path.dirname(targetPath));

      try {
        await fs.symlink(skillPath, targetPath, 'dir');
        ui.text(`  → ${targetDir}/${resolvedSkillName} (symlinked)`);
      } catch (error) {
        await fs.copy(skillPath, targetPath);
        ui.text(`  → ${targetDir}/${resolvedSkillName} (copied)`);
      }
    }

    if (!options.global) {
      await this.configManager.addSkill({
        registry: registryId,
        name: resolvedSkillName
      });
    }

    ui.text(`Successfully installed: ${resolvedSkillName}`);
    ui.info(`  Source: ${registryId}`);
    ui.info(`  Installed to (${installContext.installMode}): ${installContext.capableEnvironments.join(', ')}`);
  }

  private buildInstallContext(
    selectedEnvironments: string[],
    options: AddSkillOptions
  ): ResolvedInstallContext {
    const { targets, capableEnvironments } = this.resolveInstallationTargets(selectedEnvironments, options.global);

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

  private async resolveSkillNamesFromRegistry(registryId: string, repoPath: string): Promise<string[]> {
    if (!isInteractiveTerminal()) {
      throw new ValidationError('Skill name is required in non-interactive mode. Re-run with: ai-devkit skill add <registry> <skill-name>');
    }

    const skills = await this.listRegistrySkills(registryId, repoPath);
    return this.promptForSkillSelection(skills);
  }

  private async listRegistrySkills(registryId: string, repoPath: string): Promise<RegistrySkillChoice[]> {
    const skillsDir = path.join(repoPath, 'skills');
    if (!await fs.pathExists(skillsDir)) {
      throw new NotFoundError(`No valid skills found in ${registryId}.`, { registryId });
    }

    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const skills: RegistrySkillChoice[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !isValidSkillName(entry.name)) {
        continue;
      }

      const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
      if (!await fs.pathExists(skillMdPath)) {
        continue;
      }

      let description: string | undefined;
      try {
        const content = await fs.readFile(skillMdPath, 'utf8');
        description = extractSkillDescription(content);
      } catch {
        description = undefined;
      }

      skills.push({
        name: entry.name,
        description,
      });
    }

    if (skills.length === 0) {
      throw new NotFoundError(`No valid skills found in ${registryId}.`, { registryId });
    }

    skills.sort((a, b) => a.name.localeCompare(b.name));
    return skills;
  }

  private async promptForSkillSelection(skills: RegistrySkillChoice[]): Promise<string[]> {
    try {
      const { selectedSkills } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedSkills',
          message: 'Select skill(s) to install',
          choices: skills.map(skill => ({
            name: skill.description ? `${skill.name} - ${skill.description}` : skill.name,
            value: skill.name,
          })),
          validate: (value: string[]) => value.length > 0 || 'Select at least one skill.',
        },
      ]);

      return selectedSkills;
    } catch (error: unknown) {
      if (error instanceof Error &&
        (error.name === 'ExitPromptError' || error.message.toLowerCase().includes('cancel'))) {
        throw new Error('Skill selection cancelled.');
      }

      throw error;
    }
  }
}
