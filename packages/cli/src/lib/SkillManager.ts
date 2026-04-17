import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import inquirer from 'inquirer';
import { ConfigManager } from './Config';
import { GlobalConfigManager } from './GlobalConfig';
import { EnvironmentSelector } from './EnvironmentSelector';
import { getGlobalSkillPath, getSkillPath, validateEnvironmentCodes } from '../util/env';
import { ensureGitInstalled, cloneRepository, isGitRepository, pullRepository, fetchGitHead } from '../util/git';
import { validateRegistryId, validateSkillName, extractSkillDescription } from '../util/skill';
import { isInteractiveTerminal } from '../util/terminal';
import { fetchGitHubSkillPaths, fetchRawGitHubFile } from '../util/github';
import { ui } from '../util/terminal-ui';

const REGISTRY_URL = 'https://raw.githubusercontent.com/codeaholicguy/ai-devkit/main/skills/registry.json';
const SEED_INDEX_URL = 'https://raw.githubusercontent.com/codeaholicguy/ai-devkit/main/skills/index.json';
const SKILL_CACHE_DIR = path.join(os.homedir(), '.ai-devkit', 'skills');
const SKILL_INDEX_PATH = path.join(os.homedir(), '.ai-devkit', 'skills.json');
const INDEX_TTL_MS = 24 * 60 * 60 * 1000;

interface SkillRegistry {
  registries: Record<string, string>;
}

interface InstalledSkill {
  name: string;
  registry: string;
  environments: string[];
}

interface UpdateResult {
  registryId: string;
  status: 'success' | 'skipped' | 'error';
  message: string;
  error?: Error;
}

interface UpdateSummary {
  total: number;
  successful: number;
  skipped: number;
  failed: number;
  results: UpdateResult[];
}

interface SkillEntry {
  name: string;
  registry: string;
  path: string;
  description: string;
  lastIndexed: number;
}

interface IndexMeta {
  version: number;
  createdAt: number;
  updatedAt: number;
  registryHeads: Record<string, string>;
}

interface SkillIndex {
  meta: IndexMeta;
  skills: SkillEntry[];
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
  constructor(
    private configManager: ConfigManager,
    private environmentSelector: EnvironmentSelector = new EnvironmentSelector(),
    private globalConfigManager: GlobalConfigManager = new GlobalConfigManager()
  ) { }

  /**
   * Add a skill to the project
   * @param registryId - e.g., "anthropics/skills"
   * @param skillName - e.g., "frontend-design"
   */
  async addSkill(registryId: string, skillName?: string, options: AddSkillOptions = {}): Promise<void> {
    ui.info(`Validating registry: ${registryId}`);
    validateRegistryId(registryId);
    await ensureGitInstalled();

    const spinner = ui.spinner('Fetching registries...');
    spinner.start();
    const registry = await this.fetchMergedRegistry();
    spinner.succeed('Registries fetched');

    const gitUrl = registry.registries[registryId];
    const cachedPath = path.join(SKILL_CACHE_DIR, registryId);
    if (!gitUrl && !await fs.pathExists(cachedPath)) {
      throw new Error(
        `Registry "${registryId}" not found.`
      );
    }

    ui.info('Checking local cache...');
    const repoPath = await this.prepareRegistryRepository(registryId, gitUrl);

    const resolvedSkillNames = skillName
      ? [skillName]
      : await this.resolveSkillNamesFromRegistry(registryId, repoPath);
    const selectedEnvironments = await this.resolveInstallEnvironments(options);
    const installContext = this.buildInstallContext(selectedEnvironments, options);

    for (const resolvedSkillName of resolvedSkillNames) {
      await this.installResolvedSkill(registryId, repoPath, resolvedSkillName, options, installContext);
    }
  }

  private async resolveProjectEnvironments(): Promise<string[]> {
    ui.info('Loading project configuration...');
    let config = await this.configManager.read();
    if (!config) {
      ui.info('No .ai-devkit.json found. Creating configuration...');
      config = await this.configManager.create();
    }

    if (config.environments.length === 0) {
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
      throw new Error(`Global skill installation is not supported for: ${unsupported.join(', ')}`);
    }

    return validCodes;
  }

  private async resolveInstallEnvironments(options: AddSkillOptions): Promise<string[]> {
    if (options.environments && options.environments.length > 0 && !options.global) {
      throw new Error('--env can only be used with --global');
    }

    if (options.global) {
      return await this.resolveGlobalEnvironments(options.environments);
    }

    return await this.resolveProjectEnvironments();
  }

  /**
   * List installed skills in the project
   */
  async listSkills(): Promise<InstalledSkill[]> {
    const skills: InstalledSkill[] = [];
    const seenSkills = new Set<string>();

    const config = await this.configManager.read();
    if (!config || config.environments.length === 0) {
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
   * @param skillName - Name of the skill to remove
   */
  async removeSkill(skillName: string): Promise<void> {
    ui.info(`Removing skill: ${skillName}`);
    validateSkillName(skillName);

    const config = await this.configManager.read();
    if (!config || config.environments.length === 0) {
      throw new Error('No .ai-devkit.json found. Run: ai-devkit init');
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
      ui.success(`Successfully removed from ${removedCount} location(s).`);
      ui.info(`Note: Cached copy in ~/.ai-devkit/skills/ preserved for other projects.`);
    }
  }

  /**
   * Update skills from registries
   * @param registryId - Optional specific registry to update (e.g., "anthropic/skills")
   * @returns UpdateSummary with detailed results
   */
  async updateSkills(registryId?: string): Promise<UpdateSummary> {
    ui.info(registryId
      ? `Updating registry: ${registryId}...`
      : 'Updating all skills...'
    );

    await ensureGitInstalled();

    const cacheDir = SKILL_CACHE_DIR;
    if (!await fs.pathExists(cacheDir)) {
      ui.warning('No skills cache found. Nothing to update.');
      return { total: 0, successful: 0, skipped: 0, failed: 0, results: [] };
    }

    const entries = await fs.readdir(cacheDir, { withFileTypes: true });
    const registries: Array<{ path: string; id: string }> = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const ownerPath = path.join(cacheDir, entry.name);
        const repos = await fs.readdir(ownerPath, { withFileTypes: true });

        for (const repo of repos) {
          if (repo.isDirectory()) {
            const fullRegistryId = `${entry.name}/${repo.name}`;

            if (!registryId || fullRegistryId === registryId) {
              registries.push({
                path: path.join(ownerPath, repo.name),
                id: fullRegistryId,
              });
            }
          }
        }
      }
    }

    if (registryId && registries.length === 0) {
      throw new Error(`Registry "${registryId}" not found in cache.`);
    }

    const results: UpdateResult[] = [];

    for (const registry of registries) {
      ui.info(`Updating ${registry.id}...`);
      const result = await this.updateRegistry(registry.path, registry.id);
      results.push(result);
      if (result.status === 'success') {
        ui.success(`${registry.id} updated`);
      } else if (result.status === 'skipped') {
        ui.warning(`${registry.id} skipped (${result.message})`);
      } else {
        ui.error(`${registry.id} failed`);
      }
    }

    const summary: UpdateSummary = {
      total: results.length,
      successful: results.filter(r => r.status === 'success').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'error').length,
      results,
    };
    this.displayUpdateSummary(summary);

    return summary;
  }

  /**
   * Find skills by keyword across all registries
   * @param keyword - Search keyword to match against skill names and descriptions
   * @param options - Search options including refresh flag
   * @returns Array of matching skill entries
   */
  async findSkills(keyword: string, options?: { refresh?: boolean }): Promise<SkillEntry[]> {
    if (!keyword || keyword.trim().length === 0) {
      throw new Error('Keyword is required');
    }

    const normalizedKeyword = keyword.trim().toLowerCase();
    const index = await this.ensureSkillIndex(options?.refresh);

    return this.searchSkillIndex(index, normalizedKeyword);
  }

  private async fetchDefaultRegistry(): Promise<SkillRegistry> {
    const response = await fetch(REGISTRY_URL);

    if (!response.ok) {
      throw new Error(`Failed to fetch registry: HTTP ${response.status}`);
    }

    return response.json() as Promise<SkillRegistry>;
  }

  private async fetchMergedRegistry(): Promise<SkillRegistry> {
    let defaultRegistries: Record<string, string> = {};

    try {
      const defaultRegistry = await this.fetchDefaultRegistry();
      defaultRegistries = defaultRegistry.registries || {};
    } catch (error: any) {
      ui.warning(`Failed to fetch default registry: ${error.message}`);
      defaultRegistries = {};
    }

    const globalRegistries = await this.globalConfigManager.getSkillRegistries();
    const projectRegistries = await this.configManager.getSkillRegistries();

    return {
      registries: {
        ...defaultRegistries,
        ...globalRegistries,
        ...projectRegistries
      }
    };
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
        throw new Error('No global-skill-capable environments configured.');
      }
      throw new Error('No skill-capable environments configured. Supported: cursor, claude');
    }

    return { targets, capableEnvironments };
  }

  private async cloneRepositoryToCache(registryId: string, gitUrl?: string): Promise<string> {
    const repoPath = path.join(SKILL_CACHE_DIR, registryId);

    if (await fs.pathExists(repoPath)) {
      if (await isGitRepository(repoPath)) {
        ui.info(`Updating cached repository ${registryId}...`);
        await pullRepository(repoPath);
        ui.success(`Cached repository ${registryId} updated`);
      } else {
        ui.warning(`Cached registry ${registryId} is not a git repository, using as-is.`);
      }
      ui.text('  → Using cached repository');
      return repoPath;
    }

    if (!gitUrl) {
      throw new Error(`Registry "${registryId}" is not cached and has no configured URL.`);
    }

    ui.info(`Cloning ${registryId} (this may take a moment)...`);
    await fs.ensureDir(path.dirname(repoPath));

    const result = await cloneRepository(SKILL_CACHE_DIR, registryId, gitUrl);
    ui.success(`${registryId} cloned successfully`);
    return result;
  }

  private async prepareRegistryRepository(registryId: string, gitUrl?: string): Promise<string> {
    const cachedPath = path.join(SKILL_CACHE_DIR, registryId);

    try {
      return await this.cloneRepositoryToCache(registryId, gitUrl);
    } catch (error: any) {
      if (await fs.pathExists(cachedPath)) {
        ui.warning(`Failed to refresh ${registryId}: ${error.message}. Using cached registry contents.`);
        return cachedPath;
      }

      throw error;
    }
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
      throw new Error(
        `Skill "${resolvedSkillName}" not found in ${registryId}. Check the repository for available skills.`
      );
    }

    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (!await fs.pathExists(skillMdPath)) {
      throw new Error(
        `Invalid skill: SKILL.md not found in ${resolvedSkillName}. This may not be a valid Agent Skill.`
      );
    }

    return skillPath;
  }

  private async resolveSkillNamesFromRegistry(registryId: string, repoPath: string): Promise<string[]> {
    if (!isInteractiveTerminal()) {
      throw new Error('Skill name is required in non-interactive mode. Re-run with: ai-devkit skill add <registry> <skill-name>');
    }

    const skills = await this.listRegistrySkills(registryId, repoPath);
    return this.promptForSkillSelection(skills);
  }

  private async listRegistrySkills(registryId: string, repoPath: string): Promise<RegistrySkillChoice[]> {
    const skillsDir = path.join(repoPath, 'skills');
    if (!await fs.pathExists(skillsDir)) {
      throw new Error(`No valid skills found in ${registryId}.`);
    }

    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const skills: RegistrySkillChoice[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
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
      throw new Error(`No valid skills found in ${registryId}.`);
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
    } catch (error: any) {
      if (error?.name === 'ExitPromptError' || error?.message?.toLowerCase().includes('cancel')) {
        throw new Error('Skill selection cancelled.');
      }

      throw error;
    }
  }


  /**
   * Display update summary with colored output
   * @param summary - UpdateSummary to display
   */
  private displayUpdateSummary(summary: UpdateSummary): void {
    const errors = summary.results.filter(r => r.status === 'error');

    ui.summary({
      title: 'Summary',
      items: [
        { type: 'success', count: summary.successful, label: 'updated' },
        { type: 'warning', count: summary.skipped, label: 'skipped' },
        { type: 'error', count: summary.failed, label: 'failed' },
      ],
      details: errors.length > 0 ? {
        title: 'Errors',
        items: errors.map(error => {
          let tip: string | undefined;

          if (error.message.includes('uncommitted') || error.message.includes('unstaged')) {
            tip = `Run 'git status' in ~/.ai-devkit/skills/${error.registryId} to see details.`;
          } else if (error.message.includes('network') || error.message.includes('timeout')) {
            tip = 'Check your internet connection and try again.';
          }

          return {
            message: `${error.registryId}: ${error.message}`,
            tip,
          };
        }),
      } : undefined,
    });
  }

  /**
   * Update a single registry
   * @param registryPath - Absolute path to registry directory
   * @param registryId - Registry identifier (e.g., "anthropic/skills")
   * @returns UpdateResult with status and message
   */
  private async updateRegistry(registryPath: string, registryId: string): Promise<UpdateResult> {
    const isGit = await isGitRepository(registryPath);

    if (!isGit) {
      return {
        registryId,
        status: 'skipped',
        message: 'Not a git repository',
      };
    }
    try {
      await pullRepository(registryPath);
      return {
        registryId,
        status: 'success',
        message: 'Updated successfully',
      };
    } catch (error: any) {
      return {
        registryId,
        status: 'error',
        message: error.message,
        error,
      };
    }
  }

  /**
   * Ensure skill index is available and fresh
   * @param forceRefresh - Force rebuild regardless of TTL
   * @returns Skill index
   */
  private async ensureSkillIndex(forceRefresh = false): Promise<SkillIndex> {
    const indexExists = await fs.pathExists(SKILL_INDEX_PATH);

    if (indexExists && !forceRefresh) {
      try {
        const index: SkillIndex = await fs.readJson(SKILL_INDEX_PATH);
        const age = Date.now() - (index.meta.updatedAt || 0);

        if (age < INDEX_TTL_MS) {
          return index;
        }
        ui.info(`Index is older than 24h, checking for updates...`);
      } catch (error) {
        ui.warning('Failed to read skill index, will rebuild');
      }
    }

    if (!indexExists && !forceRefresh) {
      const spinner = ui.spinner('Fetching seed index...');
      spinner.start();
      try {
        const response = await fetch(SEED_INDEX_URL);
        if (response.ok) {
          const seedIndex = (await response.json()) as SkillIndex;
          await fs.ensureDir(path.dirname(SKILL_INDEX_PATH));
          await fs.writeJson(SKILL_INDEX_PATH, seedIndex, { spaces: 2 });
          spinner.succeed('Seed index fetched successfully');
          return seedIndex;
        }
      } catch (error) {
        spinner.fail('Failed to fetch seed index, falling back to build');
      }
    }

    const spinner = ui.spinner('Building skill index from registries...');
    spinner.start();

    try {
      const newIndex = await this.buildSkillIndex();
      await fs.ensureDir(path.dirname(SKILL_INDEX_PATH));
      await fs.writeJson(SKILL_INDEX_PATH, newIndex, { spaces: 2 });
      spinner.succeed('Skill index updated');
      return newIndex;
    } catch (error: any) {
      spinner.fail('Failed to build index');

      if (!forceRefresh && await fs.pathExists(SKILL_INDEX_PATH)) {
        ui.warning('Using stale index due to error');
        return await fs.readJson(SKILL_INDEX_PATH);
      }

      throw new Error(`Failed to build skill index: ${error.message}`);
    }
  }

  /**
   * Rebuild skill index and write to specified output path
   * @param outputPath - Optional custom output path (defaults to SKILL_INDEX_PATH)
   */
  async rebuildIndex(outputPath?: string): Promise<void> {
    const targetPath = outputPath || SKILL_INDEX_PATH;

    const spinner = ui.spinner('Rebuilding skill index from all registries...');
    spinner.start();

    try {
      const newIndex = await this.buildSkillIndex();
      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeJson(targetPath, newIndex, { spaces: 2 });
      spinner.succeed(`Skill index rebuilt: ${newIndex.skills.length} skills`);
      ui.info(`Written to: ${targetPath}`);
    } catch (error: any) {
      spinner.fail('Failed to rebuild index');
      throw new Error(`Failed to rebuild skill index: ${error.message}`);
    }
  }

  /**
   * Build skill index from all registries
   * @returns Complete skill index
   */
  private async buildSkillIndex(): Promise<SkillIndex> {
    const registry = await this.fetchMergedRegistry();
    const registryIds = Object.keys(registry.registries);

    let existingIndex: SkillIndex | null = null;
    try {
      if (await fs.pathExists(SKILL_INDEX_PATH)) {
        existingIndex = await fs.readJson(SKILL_INDEX_PATH);
      }
    } catch { /* ignore */ }

    ui.info(`Building skill index from ${registryIds.length} registries...`);

    const HEAD_CONCURRENCY = 10;
    type HeadResult = { registryId: string; headSha?: string; owner?: string; repo?: string; error?: string };
    const headResults: HeadResult[] = [];

    for (let i = 0; i < registryIds.length; i += HEAD_CONCURRENCY) {
      const batch = registryIds.slice(i, i + HEAD_CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (registryId) => {
          const gitUrl = registry.registries[registryId];
          const match = gitUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
          if (!match) return { registryId, error: 'not a GitHub URL' };

          const headSha = await fetchGitHead(gitUrl);
          return { registryId, headSha, owner: match[1], repo: match[2] };
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          headResults.push(result.value);
        }
      }
    }

    const registryHeads: Record<string, string> = {};
    const registriesToFetch: Array<{ registryId: string; owner: string; repo: string }> = [];
    const unchangedSkills: SkillEntry[] = [];

    for (const result of headResults) {
      const { registryId, headSha, owner, repo, error } = result;
      if (error || !headSha || !owner || !repo) {
        if (error) ui.warning(`Skipping ${registryId}: ${error}`);
        continue;
      }

      registryHeads[registryId] = headSha;

      const existingHead = existingIndex?.meta?.registryHeads?.[registryId];
      if (existingHead === headSha) {
        const existingSkills = existingIndex?.skills?.filter(s => s.registry === registryId) || [];
        unchangedSkills.push(...existingSkills);
      } else {
        registriesToFetch.push({ registryId, owner, repo });
      }
    }

    ui.info(`${registriesToFetch.length} registries need updating, ${unchangedSkills.length} skills cached`);

    const CONCURRENCY = 5;
    const newSkills: SkillEntry[] = [];

    for (let i = 0; i < registriesToFetch.length; i += CONCURRENCY) {
      const batch = registriesToFetch.slice(i, i + CONCURRENCY);

      const batchResults = await Promise.allSettled(
        batch.map(async ({ registryId, owner, repo }) => {
          const skillPaths = await fetchGitHubSkillPaths(owner, repo);
          const skillResults = await Promise.allSettled(
            skillPaths.map(async (skillPath: string) => {
              const content = await fetchRawGitHubFile(owner, repo, `${skillPath}/SKILL.md`);
              const description = extractSkillDescription(content);
              return {
                name: path.basename(skillPath),
                registry: registryId,
                path: skillPath,
                description,
                lastIndexed: Date.now(),
              };
            })
          );

          return skillResults
            .filter((r): r is PromiseFulfilledResult<SkillEntry> => r.status === 'fulfilled')
            .map(r => r.value);
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          newSkills.push(...result.value);
        }
      }
    }

    const skills = [...unchangedSkills, ...newSkills];

    const meta: IndexMeta = {
      version: 1,
      createdAt: existingIndex?.meta?.createdAt || Date.now(),
      updatedAt: Date.now(),
      registryHeads,
    };

    return { meta, skills };
  }

  /**
   * Search index by keyword
   * @param index - Skill index to search
   * @param keyword - Normalized lowercase keyword
   * @returns Matching skill entries
   */
  private searchSkillIndex(index: SkillIndex, keyword: string): SkillEntry[] {
    return index.skills.filter(skill => {
      const nameMatch = skill.name.toLowerCase().includes(keyword);
      const descMatch = skill.description.toLowerCase().includes(keyword);
      return nameMatch || descMatch;
    });
  }
}
