import fs from "fs-extra";
import * as path from "path";
import { SkillRegistryService, SKILL_CACHE_DIR } from "../registry/skill-registry.service.js";
import { extractSkillDescription } from "../skill-description.js";
import { fetchGitHead } from "../../../util/git.js";
import { fetchGitHubSkillPaths, fetchRawGitHubFile } from "../../../util/github.js";
import { getErrorMessage } from "../../../util/text.js";
import { parseLocalRegistryPath } from "../registry/skill-registry-source.js";
import { discoverRegistrySkills } from "../registry/registry-skill-discovery.js";
import { SkillIndexRepository } from "./skill-index.repository.js";

const SEED_INDEX_URL =
  "https://raw.githubusercontent.com/codeaholicguy/ai-devkit/main/skills/index.json";
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

export interface SkillIndexRebuildResult {
  outputPath: string;
  skillCount: number;
}

export class SkillIndexService {
  constructor(
    private registry: SkillRegistryService,
    private repository = new SkillIndexRepository(),
  ) {}

  async findSkills(keyword: string, options?: { refresh?: boolean }): Promise<SkillEntry[]> {
    if (!keyword || keyword.trim().length === 0) {
      throw new Error("Keyword is required");
    }

    const normalizedKeyword = keyword.trim().toLowerCase();
    const index = await this.ensureSkillIndex(options?.refresh);

    return this.searchSkillIndex(index, normalizedKeyword);
  }

  async rebuildIndex(outputPath?: string): Promise<SkillIndexRebuildResult> {
    const targetPath = outputPath || this.repository.defaultPath;

    try {
      const newIndex = await this.buildSkillIndex();
      await this.repository.write(newIndex, targetPath);
      return {
        outputPath: targetPath,
        skillCount: newIndex.skills.length,
      };
    } catch (error: unknown) {
      throw new Error(`Failed to rebuild skill index: ${getErrorMessage(error)}`);
    }
  }

  async updateRegistryFromCache(registryId: string, registryPath: string): Promise<void> {
    const localSkills = await this.readLocalRegistrySkills(registryId, registryPath);
    if (!localSkills) {
      return;
    }

    const existingIndex = await this.repository.read();
    const nextIndex: SkillIndexData = {
      meta: {
        version: 1,
        createdAt: existingIndex?.meta?.createdAt || Date.now(),
        updatedAt: Date.now(),
        registryHeads: existingIndex?.meta?.registryHeads || {},
      },
      skills: [
        ...(existingIndex?.skills || []).filter((skill) => skill.registry !== registryId),
        ...localSkills,
      ],
    };

    await this.repository.write(nextIndex);
  }

  async removeRegistry(registryId: string): Promise<void> {
    const existingIndex = await this.repository.read();
    if (!existingIndex) return;
    existingIndex.skills = existingIndex.skills.filter((skill) => skill.registry !== registryId);
    delete existingIndex.meta.registryHeads[registryId];
    existingIndex.meta.updatedAt = Date.now();
    await this.repository.write(existingIndex);
  }

  private async ensureSkillIndex(forceRefresh = false): Promise<SkillIndexData> {
    const indexExists = await this.repository.exists();

    if (indexExists && !forceRefresh) {
      try {
        const index = await this.repository.readRequired();
        const age = Date.now() - (index.meta.updatedAt || 0);

        if (age < INDEX_TTL_MS) {
          return this.refreshLocalRegistryEntries(index);
        }
      } catch {
        // Fall through to rebuilding the index.
      }
    }

    if (!indexExists && !forceRefresh) {
      try {
        const response = await fetch(SEED_INDEX_URL);
        if (response.ok) {
          const seedIndex = (await response.json()) as SkillIndexData;
          await this.repository.write(seedIndex);
          return this.refreshLocalRegistryEntries(seedIndex);
        }
      } catch {
        // Fall through to building from registries.
      }
    }

    try {
      const newIndex = await this.buildSkillIndex();
      await this.repository.write(newIndex);
      return newIndex;
    } catch (error: unknown) {
      if (!forceRefresh && (await this.repository.exists())) {
        return await this.repository.readRequired();
      }

      throw new Error(`Failed to build skill index: ${getErrorMessage(error)}`);
    }
  }

  private async buildSkillIndex(): Promise<SkillIndexData> {
    const registry = await this.registry.fetchMergedRegistry();
    const registryIds = Object.keys(registry.registries);

    const existingIndex = await this.repository.read();
    const localSkills = await this.readConfiguredLocalRegistrySkills(registry.registries);

    const HEAD_CONCURRENCY = 10;
    type HeadResult = {
      registryId: string;
      headSha?: string;
      owner?: string;
      repo?: string;
      error?: string;
    };
    const headResults: HeadResult[] = [];

    for (let i = 0; i < registryIds.length; i += HEAD_CONCURRENCY) {
      const batch = registryIds.slice(i, i + HEAD_CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (registryId) => {
          const gitUrl = registry.registries[registryId];
          if (parseLocalRegistryPath(gitUrl) !== null) {
            return { registryId, error: "local registry" };
          }
          const match = gitUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
          if (!match) return { registryId, error: "not a GitHub URL" };

          const headSha = await fetchGitHead(gitUrl);
          return { registryId, headSha, owner: match[1], repo: match[2] };
        }),
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
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
        continue;
      }

      registryHeads[registryId] = headSha;

      const existingHead = existingIndex?.meta?.registryHeads?.[registryId];
      if (existingHead === headSha) {
        const existingSkills =
          existingIndex?.skills?.filter((s) => s.registry === registryId) || [];
        unchangedSkills.push(...existingSkills);
      } else {
        registriesToFetch.push({ registryId, owner, repo });
      }
    }

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
            }),
          );

          return skillResults
            .filter((r): r is PromiseFulfilledResult<SkillEntry> => r.status === "fulfilled")
            .map((r) => r.value);
        }),
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          newSkills.push(...result.value);
        }
      }
    }

    const skills = this.mergeSkills([...unchangedSkills, ...newSkills], localSkills);

    const meta: IndexMeta = {
      version: 1,
      createdAt: existingIndex?.meta?.createdAt || Date.now(),
      updatedAt: Date.now(),
      registryHeads,
    };

    return { meta, skills };
  }

  private searchSkillIndex(index: SkillIndexData, keyword: string): SkillEntry[] {
    return index.skills.filter((skill) => {
      const nameMatch = skill.name.toLowerCase().includes(keyword);
      const descMatch = skill.description.toLowerCase().includes(keyword);
      return nameMatch || descMatch;
    });
  }

  private async refreshLocalRegistryEntries(index: SkillIndexData): Promise<SkillIndexData> {
    const registry = await this.registry.fetchMergedRegistry();
    const localIds = Object.entries(registry.registries)
      .filter(([, value]) => parseLocalRegistryPath(value) !== null)
      .map(([id]) => id);
    if (localIds.length === 0) return index;
    const localSkills = await this.readConfiguredLocalRegistrySkills(registry.registries);
    const next = {
      ...index,
      meta: { ...index.meta, updatedAt: Date.now() },
      skills: [
        ...index.skills.filter((skill) => !localIds.includes(skill.registry)),
        ...localSkills,
      ],
    };
    await this.repository.write(next);
    return next;
  }

  private async readConfiguredLocalRegistrySkills(
    registries: Record<string, string>,
  ): Promise<SkillEntry[]> {
    const skills: SkillEntry[] = [];

    for (const [registryId, value] of Object.entries(registries)) {
      const registrySkills =
        parseLocalRegistryPath(value) !== null
          ? await this.readLocalRegistrySkills(
              registryId,
              await this.registry.prepareRegistryRepository(registryId, value),
            )
          : await this.readLocalRegistrySkills(registryId);
      if (registrySkills) {
        skills.push(...registrySkills);
      }
    }

    return skills;
  }

  private async readLocalRegistrySkills(
    registryId: string,
    sourcePath?: string,
  ): Promise<SkillEntry[] | null> {
    const registryPath = sourcePath || path.join(SKILL_CACHE_DIR, registryId);
    if (sourcePath) {
      const discovered = await discoverRegistrySkills(registryId, sourcePath);
      return discovered.map((skill) => ({
        name: skill.name,
        registry: registryId,
        path: path.join("skills", skill.name).split(path.sep).join("/"),
        description: skill.description,
        lastIndexed: Date.now(),
      }));
    }
    const skillsPath = path.join(registryPath, "skills");

    if (!(await fs.pathExists(registryPath)) || !(await fs.pathExists(skillsPath))) {
      return null;
    }

    const discovered = await discoverRegistrySkills(registryId, registryPath);
    return discovered.map((skill) => ({
      name: skill.name,
      registry: registryId,
      path: path.join("skills", skill.name).split(path.sep).join("/"),
      description: skill.description,
      lastIndexed: Date.now(),
    }));
  }

  private mergeSkills(remoteSkills: SkillEntry[], localSkills: SkillEntry[]): SkillEntry[] {
    const merged = new Map<string, SkillEntry>();

    for (const skill of remoteSkills) {
      merged.set(this.skillKey(skill), skill);
    }

    for (const skill of localSkills) {
      merged.set(this.skillKey(skill), skill);
    }

    return [...merged.values()];
  }

  private skillKey(skill: SkillEntry): string {
    return `${skill.registry}:${skill.name}`;
  }
}
