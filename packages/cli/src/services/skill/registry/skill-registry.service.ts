import fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ConfigManager } from '../../../lib/Config.js';
import { GlobalConfigManager } from '../../../lib/GlobalConfig.js';
import { ensureGitInstalled, cloneRepository, isGitRepository, pullRepository } from '../../../util/git.js';
import { ui } from '../../../util/terminal-ui.js';
import { getErrorMessage } from '../../../util/text.js';
import { CliError, NotFoundError } from '../../../util/errors.js';
import { normalizeRegistrySourceInput, normalizeRegistrySources, parseLocalRegistryPath, planSkillRegistryAdd } from './skill-registry-source.js';
import { isValidSkillName, validateRegistryId } from '../skill-validation.js';
import { BUILTIN_SKILL_REGISTRY } from '../skill-builtins.js';
import { LOCAL_REGISTRY_MAX_ENTRIES } from './registry-skill-discovery.js';
import type { AddSkillRegistryCommandOptions, RemoveSkillRegistryCommandOptions } from '../skill.types.js';
import type { SkillRegistryAddStatus } from './skill-registry-source.js';

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

export interface AddRegistryResult {
  status: SkillRegistryAddStatus;
  registryPath?: string;
}

export class SkillRegistryService {
  private mergedRegistry?: Promise<SkillRegistryData>;
  private readonly preparedRepositories = new Map<string, Promise<string>>();

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

  fetchMergedRegistry(): Promise<SkillRegistryData> {
    if (!this.mergedRegistry) {
      this.mergedRegistry = this.loadMergedRegistry();
    }

    return this.mergedRegistry;
  }

  private async loadMergedRegistry(): Promise<SkillRegistryData> {
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
    const preparedRepository = this.preparedRepositories.get(registryId);
    if (preparedRepository) {
      return preparedRepository;
    }

    const preparation = gitUrl && parseLocalRegistryPath(gitUrl) !== null
      ? this.prepareLocalRegistry(registryId, gitUrl)
      : this.prepareGitRegistry(registryId, gitUrl);
    this.preparedRepositories.set(registryId, preparation);
    return preparation;
  }

  async cacheRegistry(registryId: string, source: string): Promise<string> {
    return this.prepareRegistryRepository(registryId, source);
  }

  async addRegistrySource(
    id: string,
    source: string,
    options: AddSkillRegistryCommandOptions = {},
  ): Promise<AddRegistryResult> {
    validateRegistryId(id);
    const configManager = options.global
      ? this.globalConfigManager
      : this.configManager;

    const registries = await configManager.getSkillRegistries();
    const value = await normalizeRegistrySourceInput(source, process.cwd());
    const [projectRegistries, globalRegistries] = await Promise.all([
      options.global ? this.configManager.getSkillRegistries() : Promise.resolve(registries),
      options.global ? Promise.resolve(registries) : this.globalConfigManager.getSkillRegistries(),
    ]);
    await normalizeRegistrySources({ ...globalRegistries, ...projectRegistries, [id]: value }, process.cwd());
    const mutation = planSkillRegistryAdd(registries, id, value, { force: options.force });

    const registryPath = mutation.status !== 'already-registered'
      ? await this.cacheRegistry(id, value)
      : undefined;

    await configManager.addSkillRegistry(id, value, { force: options.force });
    return { status: mutation.status, registryPath };
  }

  async removeRegistrySource(
    id: string,
    options: RemoveSkillRegistryCommandOptions = {},
  ): Promise<'project' | 'global'> {
    validateRegistryId(id);
    if (id === BUILTIN_SKILL_REGISTRY) {
      throw new Error(`Registry "${id}" is built in and cannot be unregistered.`);
    }

    const configManager = options.global
      ? this.globalConfigManager
      : this.configManager;
    const registries = await configManager.getSkillRegistries();
    if (!Object.prototype.hasOwnProperty.call(registries, id)) {
      throw new Error(`Registry ${id} is not registered (try --global).`);
    }

    await configManager.removeSkillRegistry(id);
    if (options.global) {
      await this.removeRegistryCache(id);
    }

    return options.global ? 'global' : 'project';
  }

  /**
   * Remove a registry's cached repository from the skill cache directory.
   * Refuses paths that would escape the cache root.
   */
  async removeRegistryCache(registryId: string): Promise<void> {
    const cacheRoot = path.resolve(SKILL_CACHE_DIR);
    const cachePath = path.resolve(cacheRoot, registryId);
    const relativeCachePath = path.relative(cacheRoot, cachePath);
    const escapesCacheRoot = relativeCachePath === '..'
      || relativeCachePath.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativeCachePath);
    if (!relativeCachePath || escapesCacheRoot) {
      throw new Error(`Refusing to remove cache outside ${cacheRoot}.`);
    }
    await fs.remove(cachePath);
  }

  private async prepareGitRegistry(registryId: string, gitUrl?: string): Promise<string> {
    await ensureGitInstalled();
    return this.refreshOrUseStaleCache(registryId, gitUrl);
  }

  private async prepareLocalRegistry(registryId: string, value: string): Promise<string> {
    const localPath = parseLocalRegistryPath(value);
    if (localPath === null) {
      throw new CliError(`Registry "${registryId}" is not a local source.`, 'INVALID_LOCAL_REGISTRY');
    }

    let root: string;
    try {
      root = await fs.realpath(localPath);
      const stat = await fs.stat(root);
      if (!stat.isDirectory()) throw new Error('source is not a directory');
    } catch (error: unknown) {
      throw new NotFoundError(
        `Local registry "${registryId}" is unavailable at ${localPath}: ${getErrorMessage(error)}. Recreate it or re-register the source.`,
        { registryId, path: localPath },
      );
    }

    const skillsPath = path.join(root, 'skills');
    if (!await fs.pathExists(skillsPath)) {
      throw new NotFoundError(
        `Local registry "${registryId}" has no skills directory: ${skillsPath}`,
        { registryId, path: skillsPath },
      );
    }
    const directory = await fs.opendir(skillsPath);
    let count = 0;
    let hasSkill = false;
    for await (const entry of directory) {
      count += 1;
      if (count > LOCAL_REGISTRY_MAX_ENTRIES) {
        throw new CliError(
          `Local registry "${registryId}" exceeds the ${LOCAL_REGISTRY_MAX_ENTRIES} entry limit.`,
          'LOCAL_REGISTRY_TOO_LARGE',
        );
      }
      if ((entry.isDirectory() || entry.isSymbolicLink())
        && isValidSkillName(entry.name)
        && await fs.pathExists(path.join(skillsPath, entry.name, 'SKILL.md'))) {
        hasSkill = true;
        break;
      }
    }
    if (!hasSkill) {
      throw new NotFoundError(
        `No valid skills found in local registry "${registryId}". Expected skills/<name>/SKILL.md.`,
        { registryId, path: skillsPath },
      );
    }

    ui.info(`Using local registry ${registryId}: ${root}`);
    return root;
  }

  private async refreshOrUseStaleCache(registryId: string, gitUrl?: string): Promise<string> {
    const cachedPath = path.join(SKILL_CACHE_DIR, registryId);
    ui.info(`Refreshing registry ${registryId}...`);

    try {
      const repositoryPath = await this.cloneRepositoryToCache(registryId, gitUrl);
      ui.success(`Registry ${registryId} refreshed.`);
      return repositoryPath;
    } catch (error: unknown) {
      if (await fs.pathExists(cachedPath)) {
        ui.warning(`Could not refresh registry ${registryId}: ${getErrorMessage(error)}. Using cached registry contents for this run.`);
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

    const cacheDir = SKILL_CACHE_DIR;
    const configured = await this.fetchMergedRegistry();
    const localEntries = Object.entries(configured.registries)
      .filter(([id, value]) => (!registryId || id === registryId) && parseLocalRegistryPath(value) !== null);
    const configuredLocalIds = new Set(Object.entries(configured.registries)
      .filter(([, value]) => parseLocalRegistryPath(value) !== null)
      .map(([id]) => id));

    const results: UpdateResult[] = [];
    for (const [id, value] of localEntries) {
      await this.prepareRegistryRepository(id, value);
      results.push({
        registryId: id,
        status: 'skipped',
        message: 'Local registry uses the live filesystem; nothing to update',
      });
      ui.warning(`${id} skipped (Local registry uses the live filesystem; nothing to update)`);
    }

    if (!await fs.pathExists(cacheDir)) {
      if (registryId && localEntries.length === 0) {
        throw new NotFoundError(`Registry "${registryId}" not found.`, { registryId });
      }
      ui.warning('No skills cache found. Nothing to update.');
      const summary = this.summarize(results);
      this.displayUpdateSummary(summary);
      return summary;
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

            if (!configuredLocalIds.has(fullRegistryId)
              && (!registryId || fullRegistryId === registryId)) {
              registries.push({
                path: path.join(ownerPath, repo.name),
                id: fullRegistryId,
              });
            }
          }
        }
      }
    }

    if (registryId && registries.length === 0 && localEntries.length === 0) {
      throw new NotFoundError(`Registry "${registryId}" not found in cache.`, { registryId });
    }

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

    const summary = this.summarize(results);
    this.displayUpdateSummary(summary);

    return summary;
  }

  private summarize(results: UpdateResult[]): UpdateSummary {
    return {
      total: results.length,
      successful: results.filter(r => r.status === 'success').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'error').length,
      results,
    };
  }

  private async updateRegistry(registryPath: string, registryId: string): Promise<UpdateResult> {
    await ensureGitInstalled();
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
