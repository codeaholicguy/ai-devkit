import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { SkillRegistry } from './SkillRegistry';
import { extractSkillDescription } from '../util/skill';
import { fetchGitHead } from '../util/git';
import { fetchGitHubSkillPaths, fetchRawGitHubFile } from '../util/github';
import { ui } from '../util/terminal-ui';
import { getErrorMessage } from '../util/text';

const SEED_INDEX_URL = 'https://raw.githubusercontent.com/codeaholicguy/ai-devkit/main/skills/index.json';
const SKILL_INDEX_PATH = path.join(os.homedir(), '.ai-devkit', 'skills.json');
const INDEX_TTL_MS = 24 * 60 * 60 * 1000;

export interface SkillEntry {
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

export interface SkillIndexData {
  meta: IndexMeta;
  skills: SkillEntry[];
}

export class SkillIndex {
  constructor(
    private registry: SkillRegistry
  ) { }

  async findSkills(keyword: string, options?: { refresh?: boolean }): Promise<SkillEntry[]> {
    if (!keyword || keyword.trim().length === 0) {
      throw new Error('Keyword is required');
    }

    const normalizedKeyword = keyword.trim().toLowerCase();
    const index = await this.ensureSkillIndex(options?.refresh);

    return this.searchSkillIndex(index, normalizedKeyword);
  }

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
    } catch (error: unknown) {
      spinner.fail('Failed to rebuild index');
      throw new Error(`Failed to rebuild skill index: ${getErrorMessage(error)}`);
    }
  }

  private async ensureSkillIndex(forceRefresh = false): Promise<SkillIndexData> {
    const indexExists = await fs.pathExists(SKILL_INDEX_PATH);

    if (indexExists && !forceRefresh) {
      try {
        const index: SkillIndexData = await fs.readJson(SKILL_INDEX_PATH);
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
          const seedIndex = (await response.json()) as SkillIndexData;
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
    } catch (error: unknown) {
      spinner.fail('Failed to build index');

      if (!forceRefresh && await fs.pathExists(SKILL_INDEX_PATH)) {
        ui.warning('Using stale index due to error');
        return await fs.readJson(SKILL_INDEX_PATH);
      }

      throw new Error(`Failed to build skill index: ${getErrorMessage(error)}`);
    }
  }

  private async buildSkillIndex(): Promise<SkillIndexData> {
    const registry = await this.registry.fetchMergedRegistry();
    const registryIds = Object.keys(registry.registries);

    let existingIndex: SkillIndexData | null = null;
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

  private searchSkillIndex(index: SkillIndexData, keyword: string): SkillEntry[] {
    return index.skills.filter(skill => {
      const nameMatch = skill.name.toLowerCase().includes(keyword);
      const descMatch = skill.description.toLowerCase().includes(keyword);
      return nameMatch || descMatch;
    });
  }
}
