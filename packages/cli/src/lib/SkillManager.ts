import * as fs from 'fs-extra';
import * as path from 'path';
import * as https from 'https';
import * as os from 'os';
import chalk from 'chalk';
import { ConfigManager } from './Config';
import { GlobalConfigManager } from './GlobalConfig';
import { EnvironmentSelector } from './EnvironmentSelector';
import { getSkillPath } from '../util/env';
import { ensureGitInstalled, cloneRepository, isGitRepository, pullRepository } from '../util/git';
import { validateRegistryId, validateSkillName } from '../util/skill';

const REGISTRY_URL = 'https://raw.githubusercontent.com/Codeaholicguy/ai-devkit/main/skills/registry.json';
const SKILL_CACHE_DIR = path.join(os.homedir(), '.ai-devkit', 'skills');

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
    console.log(`Validating skill: ${skillName} from ${registryId}`);
    validateRegistryId(registryId);
    validateSkillName(skillName);
    await ensureGitInstalled();

    console.log('Fetching registries...');
    const registry = await this.fetchMergedRegistry();

    const gitUrl = registry.registries[registryId];
    const cachedPath = path.join(SKILL_CACHE_DIR, registryId);
    if (!gitUrl && !await fs.pathExists(cachedPath)) {
      const available = Object.keys(registry.registries);
      throw new Error(
        `Registry "${registryId}" not found. Available: ${available.length ? available.join(', ') : 'none'}`
      );
    }

    console.log('Checking local cache...');
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

    console.log('Loading project configuration...');
    let config = await this.configManager.read();
    if (!config) {
      console.log('No .ai-devkit.json found. Creating configuration...');
      config = await this.configManager.create();

      if (config.environments.length === 0) {
        const selectedEnvs = await this.environmentSelector.selectSkillEnvironments();
        config.environments = selectedEnvs;
        await this.configManager.update({ environments: selectedEnvs });
        console.log('Configuration saved.\n');
      }
    }

    const skillCapableEnvs = this.filterSkillCapableEnvironments(config.environments);

    if (skillCapableEnvs.length === 0) {
      throw new Error('No skill-capable environments configured. Supported: cursor, claude');
    }

    console.log('Installing skill to project...');
    const targets = this.getInstallationTargets(skillCapableEnvs);

    for (const targetDir of targets) {
      const targetPath = path.join(process.cwd(), targetDir, skillName);

      if (await fs.pathExists(targetPath)) {
        console.log(`  → ${targetDir}/${skillName} (already exists, skipped)`);
        continue;
      }

      await fs.ensureDir(path.dirname(targetPath));

      try {
        await fs.symlink(skillPath, targetPath, 'dir');
        console.log(`  → ${targetDir}/${skillName} (symlinked)`);
      } catch (error) {
        await fs.copy(skillPath, targetPath);
        console.log(`  → ${targetDir}/${skillName} (copied)`);
      }
    }

    console.log(`\nSuccessfully installed: ${skillName}`);
    console.log(`  Source: ${registryId}`);
    console.log(`  Installed to: ${skillCapableEnvs.join(', ')}`);
  }

  /**
   * List installed skills in the project
   */
  async listSkills(): Promise<InstalledSkill[]> {
    const skills: InstalledSkill[] = [];
    const seenSkills = new Set<string>();

    const config = await this.configManager.read();
    if (!config || config.environments.length === 0) {
      console.log('No .ai-devkit.json found or no environments configured.');
      return [];
    }

    const skillCapableEnvs = this.filterSkillCapableEnvironments(config.environments);

    if (skillCapableEnvs.length === 0) {
      console.log('No skill-capable environments configured.');
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
    console.log(`Removing skill: ${skillName}`);
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
        console.log(`  → Removed from ${targetDir}`);
        removedCount++;
      }
    }

    if (removedCount === 0) {
      console.log(`\nSkill "${skillName}" not found. Nothing to remove.`);
      console.log('Tip: Run "ai-devkit skill list" to see installed skills.');
    } else {
      console.log(`\nSuccessfully removed from ${removedCount} location(s).`);
      console.log(`Note: Cached copy in ~/.ai-devkit/skills/ preserved for other projects.`);
    }
  }

  /**
   * Update skills from registries
   * @param registryId - Optional specific registry to update (e.g., "anthropic/skills")
   * @returns UpdateSummary with detailed results
   */
  async updateSkills(registryId?: string): Promise<UpdateSummary> {
    console.log(registryId
      ? `Updating registry: ${registryId}...`
      : 'Updating all skills...'
    );

    await ensureGitInstalled();

    const cacheDir = SKILL_CACHE_DIR;
    if (!await fs.pathExists(cacheDir)) {
      console.log(chalk.yellow('\nNo skills cache found. Nothing to update.'));
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
      console.log(chalk.dim(`\n  → ${registry.id}...`));
      const result = await this.updateRegistry(registry.path, registry.id);
      results.push(result);
      if (result.status === 'success') {
        console.log(chalk.green(`    ✓ Updated`));
      } else if (result.status === 'skipped') {
        console.log(chalk.yellow(`    ⊘ Skipped (${result.message})`));
      } else {
        console.log(chalk.red(`    ✗ Failed`));
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

  private async fetchDefaultRegistry(): Promise<SkillRegistry> {
    return new Promise((resolve, reject) => {
      https.get(REGISTRY_URL, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to fetch registry: HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error('Failed to parse registry JSON'));
          }
        });
      }).on('error', (error) => {
        reject(new Error(`Network error fetching registry: ${error.message}`));
      });
    });
  }

  private async fetchMergedRegistry(): Promise<SkillRegistry> {
    let defaultRegistries: Record<string, string> = {};

    try {
      const defaultRegistry = await this.fetchDefaultRegistry();
      defaultRegistries = defaultRegistry.registries || {};
    } catch {
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
      console.log('  → Using cached repository');
      return repoPath;
    }

    if (!gitUrl) {
      throw new Error(`Registry "${registryId}" is not cached and has no configured URL.`);
    }

    console.log(`  → Cloning ${registryId} (this may take a moment)...`);
    await fs.ensureDir(path.dirname(repoPath));

    return await cloneRepository(SKILL_CACHE_DIR, registryId, gitUrl);
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
    console.log(chalk.bold('\n\nSummary:'));

    if (summary.successful > 0) {
      console.log(chalk.green(`  ✓ ${summary.successful} updated`));
    }

    if (summary.skipped > 0) {
      console.log(chalk.yellow(`  ⊘ ${summary.skipped} skipped`));
    }

    if (summary.failed > 0) {
      console.log(chalk.red(`  ✗ ${summary.failed} failed`));
    }

    const errors = summary.results.filter(r => r.status === 'error');
    if (errors.length > 0) {
      console.log(chalk.bold('\n\nErrors:'));

      for (const error of errors) {
        console.log(chalk.red(`  • ${error.registryId}: ${error.message}`));

        if (error.message.includes('uncommitted') || error.message.includes('unstaged')) {
          console.log(chalk.dim(`    Tip: Run 'git status' in ~/.ai-devkit/skills/${error.registryId} to see details.`));
        } else if (error.message.includes('network') || error.message.includes('timeout')) {
          console.log(chalk.dim(`    Tip: Check your internet connection and try again.`));
        }
      }
    }
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
}