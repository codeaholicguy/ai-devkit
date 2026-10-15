// Browser-side access to the public skill registry index.
// The index and the list's filters live at module level so moving between the
// registry list and a skill page (and back) is instant and keeps its state.

export interface RegistrySkill {
  name: string;
  registry: string;
  path: string;
  description: string;
}

export interface RegistryFilters {
  query: string;
  registry: string;
  limit: number;
}

export const REGISTRY_PAGE_SIZE = 60;

const INDEX_URL = 'https://raw.githubusercontent.com/codeaholicguy/ai-devkit/main/skills/index.json';

let cachedSkills: RegistrySkill[] | null = null;
let pending: Promise<RegistrySkill[]> | null = null;
let savedFilters: RegistryFilters = { query: '', registry: '', limit: REGISTRY_PAGE_SIZE };
let openedFromList = false;

export function getCachedRegistry(): RegistrySkill[] | null {
  return cachedSkills;
}

export function loadRegistry(): Promise<RegistrySkill[]> {
  if (cachedSkills) return Promise.resolve(cachedSkills);
  pending ??= fetch(INDEX_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`Registry index returned ${response.status}`);
      return response.json() as Promise<{ skills: RegistrySkill[] }>;
    })
    .then((data) => {
      cachedSkills = data.skills;
      return data.skills;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function getSavedFilters(): RegistryFilters {
  return savedFilters;
}

export function saveFilters(filters: RegistryFilters) {
  savedFilters = filters;
}

/** Remember that the next skill page was opened from the list, so "Back to results" can go back. */
export function markOpenedFromList(value: boolean) {
  openedFromList = value;
}

export function wasOpenedFromList(): boolean {
  return openedFromList;
}

export function registrySkillHref(skill: { registry: string; name: string }): string {
  const segments = [...skill.registry.split('/'), skill.name].map(encodeURIComponent);
  return `/skills/registry/?skill=${segments.join('/')}`;
}

/** "owner/repo/name" → { registry: "owner/repo", name }. */
export function parseRegistrySkillParam(value: string | null): { registry: string; name: string } | null {
  if (!value) return null;
  const decoded = value.split('/').map(decodeURIComponent).join('/');
  const split = decoded.lastIndexOf('/');
  if (split <= 0 || split === decoded.length - 1) return null;
  return { registry: decoded.slice(0, split), name: decoded.slice(split + 1) };
}

/** Raw SKILL.md on the repo's default branch. */
export function skillMarkdownUrl(skill: RegistrySkill): string {
  return `https://raw.githubusercontent.com/${skill.registry}/HEAD/${skill.path}/SKILL.md`;
}

export function skillGithubUrl(skill: RegistrySkill): string {
  return `https://github.com/${skill.registry}/blob/HEAD/${skill.path}/SKILL.md`;
}
