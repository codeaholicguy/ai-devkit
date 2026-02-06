import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ConfigManager } from './Config';
import { GlobalConfigManager } from './GlobalConfig';
import { EnvironmentSelector } from './EnvironmentSelector';
import { getSkillPath } from '../util/env';
import { ensureGitInstalled, cloneRepository, isGitRepository, pullRepository, fetchGitHead } from '../util/git';
import { validateRegistryId, validateSkillName, extractSkillDescription } from '../util/skill';
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
  async addSkill(registryId: string, skillName: string): Promise<void> {
    ui.info(`Validating skill: ${skillName} from ${registryId}`);
    validateRegistryId(registryId);
    validateSkillName(skillName);
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
    const repoPath = await this.cloneRepositoryToCache(registryId, gitUrl);

    const skillPath = path.join(repoPath, 'skills', skillName);
    if (!await fs.pathExists(skillPath)) {
      throw new Error(
        `Skill "${skillName}" not found in ${registryId}. Check the repository for available skills.`
      );
    }

    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (!await fs.pathExists(skillMdPath)) {
      throw new Error(
        `Invalid skill: SKILL.md not found in ${skillName}. This may not be a valid Agent Skill.`
      );
    }

    ui.info('Loading project configuration...');
    let config = await this.configManager.read();
    if (!config) {
      ui.info('No .ai-devkit.json found. Creating configuration...');
      config = await this.configManager.create();

      if (config.environments.length === 0) {
        const selectedEnvs = await this.environmentSelector.selectSkillEnvironments();
        config.environments = selectedEnvs;
        await this.configManager.update({ environments: selectedEnvs });
        ui.success('Configuration saved.');
      }
    }

    const skillCapableEnvs = this.filterSkillCapableEnvironments(config.environments);

    if (skillCapableEnvs.length === 0) {
      throw new Error('No skill-capable environments configured.');
    }

    ui.info('Installing skill to project...');
    const targets = this.getInstallationTargets(skillCapableEnvs);

    for (const targetDir of targets) {
      const targetPath = path.join(process.cwd(), targetDir, skillName);

      if (await fs.pathExists(targetPath)) {
        ui.text(`  → ${targetDir}/${skillName} (already exists, skipped)`);
        continue;
      }

      await fs.ensureDir(path.dirname(targetPath));

      try {
        await fs.symlink(skillPath, targetPath, 'dir');
        ui.text(`  → ${targetDir}/${skillName} (symlinked)`);
      } catch (error) {
        await fs.copy(skillPath, targetPath);
        ui.text(`  → ${targetDir}/${skillName} (copied)`);
      }
    }

    ui.text(`Successfully installed: ${skillName}`);
    ui.info(`  Source: ${registryId}`);
    ui.info(`  Installed to: ${skillCapableEnvs.join(', ')}`);
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

    const skillCapableEnvs = this.filterSkillCapableEnvironments(config.environments);

    if (skillCapableEnvs.length === 0) {
      ui.warning('No skill-capable environments configured.');
      return [];
    }

    const targets = this.getInstallationTargets(skillCapableEnvs);

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
              environments: skillCapableEnvs,
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

    const skillCapableEnvs = this.filterSkillCapableEnvironments(config.environments);

    if (skillCapableEnvs.length === 0) {
      throw new Error('No skill-capable environments configured. Supported: cursor, claude');
    }

    const targets = this.getInstallationTargets(skillCapableEnvs);
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
      const spinner = ui.spinner(`Updating ${registry.id}...`);
      spinner.start();
      const result = await this.updateRegistry(registry.path, registry.id);
      results.push(result);
      if (result.status === 'success') {
        spinner.succeed(`${registry.id} updated`);
      } else if (result.status === 'skipped') {
        spinner.warn(`${registry.id} skipped (${result.message})`);
      } else {
        spinner.fail(`${registry.id} failed`);
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

    const customRegistries = await this.globalConfigManager.getSkillRegistries();

    return {
      registries: {
        ...defaultRegistries,
        ...customRegistries
      }
    };
  }

  private getInstallationTargets(environments: string[]): string[] {
    const targets: string[] = [];

    for (const env of environments) {
      const skillPath = getSkillPath(env as any);
      if (skillPath) {
        targets.push(skillPath);
      }
    }

    if (targets.length === 0) {
      throw new Error('No skill-capable environments configured. Supported: cursor, claude');
    }

    return targets;
  }

  private async cloneRepositoryToCache(registryId: string, gitUrl?: string): Promise<string> {
    const repoPath = path.join(SKILL_CACHE_DIR, registryId);

    if (await fs.pathExists(repoPath)) {
      ui.text('  → Using cached repository');
      return repoPath;
    }

    if (!gitUrl) {
      throw new Error(`Registry "${registryId}" is not cached and has no configured URL.`);
    }

    const spinner = ui.spinner(`Cloning ${registryId} (this may take a moment)...`);
    spinner.start();
    await fs.ensureDir(path.dirname(repoPath));

    const result = await cloneRepository(SKILL_CACHE_DIR, registryId, gitUrl);
    spinner.succeed(`${registryId} cloned successfully`);
    return result;
  }

  private filterSkillCapableEnvironments(environments: string[]): string[] {
    return environments.filter(env => {
      const skillPath = getSkillPath(env as any);
      return skillPath !== undefined;
    });
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