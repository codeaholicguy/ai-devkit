import fs from 'fs-extra';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigManager } from '../../lib/Config.js';
import type { GlobalConfigManager } from '../../lib/GlobalConfig.js';
import { NotFoundError } from '../../util/errors.js';
import * as git from '../../util/git.js';
import { ui } from '../../util/terminal-ui.js';

const testPaths = vi.hoisted(() => ({
  home: `/tmp/ai-devkit-skill-registry-${process.pid}`,
}));

vi.mock('os', async (importOriginal) => ({
  ...await importOriginal<typeof import('os')>(),
  homedir: () => testPaths.home,
}));

vi.mock('../../util/git.js', () => ({
  ensureGitInstalled: vi.fn(),
  cloneRepository: vi.fn(),
  isGitRepository: vi.fn(),
  pullRepository: vi.fn(),
}));

vi.mock('../../util/terminal-ui.js', () => ({
  ui: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    summary: vi.fn(),
    text: vi.fn(),
    warning: vi.fn(),
  },
}));

import { SkillRegistry, SKILL_CACHE_DIR } from '../../lib/SkillRegistry.js';

const mockedGit = vi.mocked(git);
const mockedUi = vi.mocked(ui);

describe('SkillRegistry.updateSkills', () => {
  let registry: SkillRegistry;

  const seedRegistry = async (id: string): Promise<string> => {
    const registryPath = path.join(SKILL_CACHE_DIR, id);
    await fs.ensureDir(registryPath);
    return registryPath;
  };

  beforeEach(async () => {
    await fs.remove(testPaths.home);
    vi.clearAllMocks();
    mockedGit.isGitRepository.mockResolvedValue(true);
    mockedGit.pullRepository.mockResolvedValue(undefined);
    registry = new SkillRegistry({} as ConfigManager, {} as GlobalConfigManager);
  });

  afterEach(async () => {
    await fs.remove(testPaths.home);
  });

  it('returns an empty summary when the cache does not exist', async () => {
    const summary = await registry.updateSkills();

    expect(summary).toEqual({ total: 0, successful: 0, skipped: 0, failed: 0, results: [] });
    expect(mockedGit.pullRepository).not.toHaveBeenCalled();
  });

  it('updates every cached registry when no filter is provided', async () => {
    const first = await seedRegistry('codeaholicguy/ai-devkit');
    const second = await seedRegistry('vercel-labs/agent-skills');

    const summary = await registry.updateSkills();

    expect(mockedGit.pullRepository).toHaveBeenCalledTimes(2);
    expect(mockedGit.pullRepository).toHaveBeenCalledWith(first);
    expect(mockedGit.pullRepository).toHaveBeenCalledWith(second);
    expect(summary).toMatchObject({ total: 2, successful: 2, skipped: 0, failed: 0 });
  });

  it('updates only the exact owner/repo filter', async () => {
    const selected = await seedRegistry('codeaholicguy/ai-devkit');
    await seedRegistry('vercel-labs/agent-skills');

    const summary = await registry.updateSkills('codeaholicguy/ai-devkit');

    expect(mockedGit.pullRepository).toHaveBeenCalledOnce();
    expect(mockedGit.pullRepository).toHaveBeenCalledWith(selected);
    expect(summary.results.map(result => result.registryId)).toEqual(['codeaholicguy/ai-devkit']);
  });

  it('lists sorted available registries when an exact filter is unknown', async () => {
    await seedRegistry('vercel-labs/agent-skills');
    await seedRegistry('codeaholicguy/skills');
    await seedRegistry('codeaholicguy/ai-devkit');

    await expect(registry.updateSkills('missing/registry')).rejects.toEqual(expect.objectContaining({
      name: 'NotFoundError',
      message: 'Registry "missing/registry" not found in cache. Available: codeaholicguy/ai-devkit, codeaholicguy/skills, vercel-labs/agent-skills.',
    } satisfies Partial<NotFoundError>));
    expect(mockedGit.pullRepository).not.toHaveBeenCalled();
  });

  it('resolves a unique owner-less repository name and reports the full id', async () => {
    const selected = await seedRegistry('codeaholicguy/ai-devkit');
    await seedRegistry('vercel-labs/agent-skills');

    const summary = await registry.updateSkills('ai-devkit');

    expect(mockedUi.info).toHaveBeenCalledWith('Resolved registry "ai-devkit" to "codeaholicguy/ai-devkit".');
    expect(mockedGit.pullRepository).toHaveBeenCalledOnce();
    expect(mockedGit.pullRepository).toHaveBeenCalledWith(selected);
    expect(summary.results[0].registryId).toBe('codeaholicguy/ai-devkit');
  });

  it('rejects an ambiguous owner-less repository name', async () => {
    await seedRegistry('first/skills');
    await seedRegistry('second/skills');

    await expect(registry.updateSkills('skills')).rejects.toThrow(
      'Registry "skills" not found in cache. Available: first/skills, second/skills.'
    );
    expect(mockedGit.pullRepository).not.toHaveBeenCalled();
  });

  it('rejects an unmatched owner-less repository name', async () => {
    await seedRegistry('codeaholicguy/ai-devkit');

    await expect(registry.updateSkills('skills')).rejects.toThrow(
      'Registry "skills" not found in cache. Available: codeaholicguy/ai-devkit.'
    );
    expect(mockedGit.pullRepository).not.toHaveBeenCalled();
  });

  it('skips a non-git cache directory and counts it in the summary', async () => {
    const gitRegistry = await seedRegistry('codeaholicguy/ai-devkit');
    const plainDirectory = await seedRegistry('local/skills');
    mockedGit.isGitRepository.mockImplementation(async candidate => candidate !== plainDirectory);

    const summary = await registry.updateSkills();

    expect(mockedGit.pullRepository).toHaveBeenCalledOnce();
    expect(mockedGit.pullRepository).toHaveBeenCalledWith(gitRegistry);
    expect(summary).toMatchObject({ total: 2, successful: 1, skipped: 1, failed: 0 });
  });

  it('reports correct summary counts for success, skip, and failure results', async () => {
    const successful = await seedRegistry('one/success');
    const skipped = await seedRegistry('two/skipped');
    const failed = await seedRegistry('three/failed');
    mockedGit.isGitRepository.mockImplementation(async candidate => candidate !== skipped);
    mockedGit.pullRepository.mockImplementation(async candidate => {
      if (candidate === failed) throw new Error('network unavailable');
    });

    const summary = await registry.updateSkills();

    expect(mockedGit.pullRepository).toHaveBeenCalledWith(successful);
    expect(summary).toMatchObject({ total: 3, successful: 1, skipped: 1, failed: 1 });
    expect(summary.results.map(result => result.status).sort()).toEqual(['error', 'skipped', 'success']);
  });
});
