import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ConfigManager } from './Config';
import { GlobalConfigManager } from './GlobalConfig';
import { ensureGitInstalled, cloneRepository, isGitRepository, pullRepository } from '../util/git';
import { ui } from '../util/terminal-ui';
import { getErrorMessage } from '../util/text';
import { CliError, NotFoundError } from '../util/errors';

export const REGISTRY_URL = 'https://raw.githubusercontent.com/codeaholicguy/ai-devkit/main/skills/registry.json';
export const SKILL_CACHE_DIR = path.join(os.homedir(), '.ai-devkit', 'skills');

export interface SkillRegistryData {
  registries: Record<string, string>;
}

export interface UpdateResult {
  registryId: string;
  status: 'success' | 'skipped' | 'error';
  message: string;
  error?: Error;
}

export interface UpdateSummary {
  total: number;
  successful: number;
  skipped: number;
  failed: number;
  results: UpdateResult[];
}

export class SkillRegistry {
  constructor(
    private configManager: ConfigManager,
    private globalConfigManager: GlobalConfigManager
  ) { }

  async fetchDefaultRegistry(): Promise<SkillRegistryData> {
    const response = await fetch(REGISTRY_URL);

    if (!response.ok) {
      throw new CliError(`Failed to fetch registry: HTTP ${response.status}`, 'NETWORK_ERROR');
    }

    return response.json() as Promise<SkillRegistryData>;
  }

  async fetchMergedRegistry(): Promise<SkillRegistryData> {
    let defaultRegistries: Record<string, string> = {};

    try {
      const defaultRegistry = await this.fetchDefaultRegistry();
      defaultRegistries = defaultRegistry.registries || {};
    } catch (error: unknown) {
      ui.warning(`Failed to fetch default registry: ${getErrorMessage(error)}`);
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

  async cloneRepositoryToCache(registryId: string, gitUrl?: string): Promise<string> {
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
      throw new NotFoundError(`Registry "${registryId}" is not cached and has no configured URL.`, { registryId });
    }

    ui.info(`Cloning ${registryId} (this may take a moment)...`);
    await fs.ensureDir(path.dirname(repoPath));

    const result = await cloneRepository(SKILL_CACHE_DIR, registryId, gitUrl);
    ui.success(`${registryId} cloned successfully`);
    return result;
  }

  async prepareRegistryRepository(registryId: string, gitUrl?: string): Promise<string> {
    const cachedPath = path.join(SKILL_CACHE_DIR, registryId);

    try {
      return await this.cloneRepositoryToCache(registryId, gitUrl);
    } catch (error: unknown) {
      if (await fs.pathExists(cachedPath)) {
        ui.warning(`Failed to refresh ${registryId}: ${getErrorMessage(error)}. Using cached registry contents.`);
        return cachedPath;
      }

      throw error;
    }
  }

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
      throw new NotFoundError(`Registry "${registryId}" not found in cache.`, { registryId });
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
    } catch (error: unknown) {
      return {
        registryId,
        status: 'error',
        message: getErrorMessage(error),
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

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
}
