import type { Mocked } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { SkillRegistry, SKILL_CACHE_DIR } from '../../lib/SkillRegistry.js';
import { ConfigManager } from '../../lib/Config.js';
import { GlobalConfigManager } from '../../lib/GlobalConfig.js';
import * as gitUtil from '../../util/git.js';

const mockUi = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  text: vi.fn(),
  error: vi.fn(),
  summary: vi.fn(),
}));

vi.mock('fs-extra', () => ({
  default: {
    pathExists: vi.fn(),
    ensureDir: vi.fn(),
  },
}));

vi.mock('../../util/git.js', () => ({
  ensureGitInstalled: vi.fn(),
  cloneRepository: vi.fn(),
  isGitRepository: vi.fn(),
  pullRepository: vi.fn(),
}));

vi.mock('../../util/terminal-ui.js', () => ({ ui: mockUi }));

const mockedFs = fs as Mocked<typeof fs>;
const mockedGit = gitUtil as Mocked<typeof gitUtil>;

function createRegistry(): SkillRegistry {
  return new SkillRegistry({} as ConfigManager, {} as GlobalConfigManager);
}

describe('SkillRegistry repository preparation', () => {
  const registryId = 'example/skills';
  const secondRegistryId = 'other/skills';
  const gitUrl = 'https://github.com/example/skills.git';
  const cachedPath = path.join(SKILL_CACHE_DIR, registryId);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedFs.pathExists.mockResolvedValue(true);
    mockedFs.ensureDir.mockResolvedValue(undefined);
    mockedGit.isGitRepository.mockResolvedValue(true);
    mockedGit.pullRepository.mockResolvedValue(undefined);
  });

  it('refreshes one registry once for sequential preparations', async () => {
    const registry = createRegistry();

    await registry.prepareRegistryRepository(registryId, gitUrl);
    await registry.prepareRegistryRepository(registryId, gitUrl);

    expect(mockedGit.pullRepository).toHaveBeenCalledTimes(1);
    expect(mockUi.info).toHaveBeenCalledWith(`Refreshing registry ${registryId}...`);
    expect(mockUi.success).toHaveBeenCalledWith(`Registry ${registryId} refreshed.`);
  });

  it('shares one in-flight refresh between concurrent preparations', async () => {
    let finishPull: (() => void) | undefined;
    mockedGit.pullRepository.mockImplementation(() => new Promise<void>(resolve => {
      finishPull = resolve;
    }));
    const registry = createRegistry();

    const first = registry.prepareRegistryRepository(registryId, gitUrl);
    const second = registry.prepareRegistryRepository(registryId, gitUrl);
    await vi.waitFor(() => expect(mockedGit.pullRepository).toHaveBeenCalledTimes(1));
    finishPull?.();

    await expect(Promise.all([first, second])).resolves.toEqual([cachedPath, cachedPath]);
    expect(mockedGit.pullRepository).toHaveBeenCalledTimes(1);
  });

  it('refreshes different registries independently', async () => {
    const registry = createRegistry();

    await registry.prepareRegistryRepository(registryId, gitUrl);
    await registry.prepareRegistryRepository(secondRegistryId, 'https://github.com/other/skills.git');
    await registry.prepareRegistryRepository(secondRegistryId, 'ignored-url');

    expect(mockedGit.pullRepository).toHaveBeenCalledTimes(2);
    expect(mockedGit.pullRepository).toHaveBeenCalledWith(path.join(SKILL_CACHE_DIR, secondRegistryId));
  });

  it('reuses stale cache after one failed refresh without retrying', async () => {
    mockedGit.pullRepository.mockRejectedValue(new Error('network down'));
    const registry = createRegistry();

    await expect(registry.prepareRegistryRepository(registryId, gitUrl)).resolves.toBe(cachedPath);
    await expect(registry.prepareRegistryRepository(registryId, gitUrl)).resolves.toBe(cachedPath);

    expect(mockedGit.pullRepository).toHaveBeenCalledTimes(1);
    expect(mockUi.warning).toHaveBeenCalledTimes(1);
    expect(mockUi.warning).toHaveBeenCalledWith(
      `Could not refresh registry ${registryId}: network down. Using cached registry contents for this run.`,
    );
  });

  it('reuses a failed no-cache preparation without retrying', async () => {
    mockedFs.pathExists.mockResolvedValue(false);
    mockedGit.cloneRepository.mockRejectedValue(new Error('clone failed'));
    const registry = createRegistry();

    await expect(registry.prepareRegistryRepository(registryId, gitUrl)).rejects.toThrow('clone failed');
    await expect(registry.prepareRegistryRepository(registryId, gitUrl)).rejects.toThrow('clone failed');

    expect(mockedGit.cloneRepository).toHaveBeenCalledTimes(1);
  });

  it('refreshes again for a second registry instance', async () => {
    await createRegistry().prepareRegistryRepository(registryId, gitUrl);
    await createRegistry().prepareRegistryRepository(registryId, gitUrl);

    expect(mockedGit.pullRepository).toHaveBeenCalledTimes(2);
  });

  it('reuses a non-git cached registry without repeating its outcome', async () => {
    mockedGit.isGitRepository.mockResolvedValue(false);
    const registry = createRegistry();

    await registry.prepareRegistryRepository(registryId, gitUrl);
    await registry.prepareRegistryRepository(registryId, gitUrl);

    expect(mockedGit.isGitRepository).toHaveBeenCalledTimes(1);
    expect(mockedGit.pullRepository).not.toHaveBeenCalled();
    expect(mockUi.warning).toHaveBeenCalledTimes(1);
    expect(mockUi.warning).toHaveBeenCalledWith(
      `Cached registry ${registryId} is not a git repository, using as-is.`,
    );
  });
});
