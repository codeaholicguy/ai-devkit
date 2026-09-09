import type { Mocked } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { SkillRegistryService, SKILL_CACHE_DIR } from '../../../../services/skill/registry/skill-registry.service.js';
import { ConfigManager } from '../../../../lib/Config.js';
import { GlobalConfigManager } from '../../../../lib/GlobalConfig.js';
import * as gitUtil from '../../../../util/git.js';

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
    stat: vi.fn(),
    readdir: vi.fn(),
    opendir: vi.fn(),
    realpath: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('../../../../util/git.js', () => ({
  ensureGitInstalled: vi.fn(),
  cloneRepository: vi.fn(),
  isGitRepository: vi.fn(),
  pullRepository: vi.fn(),
}));

vi.mock('../../../../util/terminal-ui.js', () => ({ ui: mockUi }));

const mockedFs = fs as Mocked<typeof fs>;
const mockedGit = gitUtil as Mocked<typeof gitUtil>;

function createRegistry(): SkillRegistryService {
  return new SkillRegistryService({} as ConfigManager, {} as GlobalConfigManager);
}

describe('SkillRegistryService merged catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and merges the catalog once per instance', async () => {
    const fetchRegistry = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ registries: { 'default/skills': 'default-url' } }),
    });
    vi.stubGlobal('fetch', fetchRegistry);
    const configManager = {
      getSkillRegistries: vi.fn().mockResolvedValue({ 'project/skills': 'project-url' }),
    } as unknown as ConfigManager;
    const globalConfigManager = {
      getSkillRegistries: vi.fn().mockResolvedValue({ 'global/skills': 'global-url' }),
    } as unknown as GlobalConfigManager;
    const registry = new SkillRegistryService(configManager, globalConfigManager);

    const [first, second] = await Promise.all([
      registry.fetchMergedRegistry(),
      registry.fetchMergedRegistry(),
    ]);
    const third = await registry.fetchMergedRegistry();

    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(fetchRegistry).toHaveBeenCalledTimes(1);
    expect(globalConfigManager.getSkillRegistries).toHaveBeenCalledTimes(1);
    expect(configManager.getSkillRegistries).toHaveBeenCalledTimes(1);
  });
});

describe('SkillRegistryService repository preparation', () => {
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

  it('prepares the registry repository in the local cache', async () => {
    const repoPath = path.join(SKILL_CACHE_DIR, registryId);
    mockedFs.pathExists.mockResolvedValue(false);
    mockedGit.cloneRepository.mockResolvedValue(repoPath);

    const result = await createRegistry().cacheRegistry(registryId, gitUrl);

    expect(mockedGit.ensureGitInstalled).toHaveBeenCalledOnce();
    expect(mockedGit.cloneRepository).toHaveBeenCalledWith(SKILL_CACHE_DIR, registryId, gitUrl);
    expect(result).toBe(repoPath);
  });

  it('removes the contained registry cache directory', async () => {
    await createRegistry().removeRegistryCache('example/skills');

    expect(mockedFs.remove).toHaveBeenCalledWith(
      path.join(SKILL_CACHE_DIR, 'example', 'skills'),
    );
  });

  it('refuses paths that escape the cache root', async () => {
    await expect(
      createRegistry().removeRegistryCache('../escaped'),
    ).rejects.toThrow(/outside/);
    expect(mockedFs.remove).not.toHaveBeenCalled();
  });

  it('prepares a local registry once without invoking Git or writing', async () => {
    const localPath = '/tmp/local-skills';
    mockedFs.realpath.mockResolvedValue(localPath);
    mockedFs.stat.mockResolvedValue({ isDirectory: () => true } as Awaited<ReturnType<typeof fs.stat>>);
    mockedFs.opendir.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { name: 'test-skill', isDirectory: () => true, isSymbolicLink: () => false };
      },
    } as Awaited<ReturnType<typeof fs.opendir>>);
    mockedFs.pathExists.mockResolvedValue(true);
    const registry = createRegistry();

    await expect(registry.prepareRegistryRepository(registryId, 'file:///tmp/local-skills'))
      .resolves.toBe(localPath);
    await expect(registry.prepareRegistryRepository(registryId, 'file:///tmp/local-skills'))
      .resolves.toBe(localPath);

    expect(mockedFs.realpath).toHaveBeenCalledTimes(1);
    expect(mockedFs.ensureDir).not.toHaveBeenCalled();
    expect(mockedGit.ensureGitInstalled).not.toHaveBeenCalled();
    expect(mockedGit.isGitRepository).not.toHaveBeenCalled();
    expect(mockedGit.pullRepository).not.toHaveBeenCalled();
    expect(mockedGit.cloneRepository).not.toHaveBeenCalled();
  });

  it('does not use a same-ID cache when a local registry is missing', async () => {
    mockedFs.realpath.mockRejectedValue(new Error('ENOENT'));
    mockedFs.pathExists.mockResolvedValue(true);

    await expect(createRegistry().prepareRegistryRepository(registryId, 'file:///missing'))
      .rejects.toThrow(/unavailable/i);
    expect(mockedGit.pullRepository).not.toHaveBeenCalled();
  });

  it('treats update of a local registry as a read-only live-filesystem no-op', async () => {
    const localPath = '/tmp/local-skills';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ registries: {} }) }));
    mockedFs.realpath.mockResolvedValue(localPath);
    mockedFs.stat.mockResolvedValue({ isDirectory: () => true } as Awaited<ReturnType<typeof fs.stat>>);
    mockedFs.opendir.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { name: 'test-skill', isDirectory: () => true, isSymbolicLink: () => false };
      },
    } as Awaited<ReturnType<typeof fs.opendir>>);
    mockedFs.pathExists.mockResolvedValue(true);
    mockedFs.readdir.mockResolvedValue([]);
    const registry = new SkillRegistryService(
      { getSkillRegistries: vi.fn().mockResolvedValue({ [registryId]: 'file:///tmp/local-skills' }) } as unknown as ConfigManager,
      { getSkillRegistries: vi.fn().mockResolvedValue({}) } as unknown as GlobalConfigManager,
    );

    await expect(registry.updateSkills(registryId)).resolves.toMatchObject({
      total: 1, successful: 0, skipped: 1, failed: 0,
    });
    expect(mockedGit.ensureGitInstalled).not.toHaveBeenCalled();
    expect(mockedGit.pullRepository).not.toHaveBeenCalled();
    expect(mockedGit.isGitRepository).not.toHaveBeenCalled();
    expect(mockedFs.ensureDir).not.toHaveBeenCalled();
  });
});

describe('SkillRegistryService registry source mutations', () => {
  const registryId = 'example/private-skills';
  const gitUrl = 'git@example.com:example/private-skills.git';
  const cachedPath = path.join(SKILL_CACHE_DIR, registryId);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedFs.pathExists.mockResolvedValue(false);
    mockedFs.ensureDir.mockResolvedValue(undefined);
    mockedGit.cloneRepository.mockResolvedValue(cachedPath);
  });

  it('adds a project registry source and prepares its cache', async () => {
    const configManager = {
      getSkillRegistries: vi.fn().mockResolvedValue({}),
      addSkillRegistry: vi.fn().mockResolvedValue({}),
    } as unknown as ConfigManager;
    const globalConfigManager = {
      getSkillRegistries: vi.fn().mockResolvedValue({}),
    } as unknown as GlobalConfigManager;
    const registry = new SkillRegistryService(configManager, globalConfigManager);

    await expect(registry.addRegistrySource(registryId, gitUrl)).resolves.toEqual({
      status: 'added',
      registryPath: cachedPath,
    });

    expect(configManager.addSkillRegistry).toHaveBeenCalledWith(registryId, gitUrl, { force: undefined });
    expect(mockedGit.cloneRepository).toHaveBeenCalledWith(SKILL_CACHE_DIR, registryId, gitUrl);
  });

  it('adds a global registry source through global config', async () => {
    const configManager = {
      getSkillRegistries: vi.fn().mockResolvedValue({}),
    } as unknown as ConfigManager;
    const globalConfigManager = {
      getSkillRegistries: vi.fn().mockResolvedValue({}),
      addSkillRegistry: vi.fn().mockResolvedValue({}),
    } as unknown as GlobalConfigManager;
    const registry = new SkillRegistryService(configManager, globalConfigManager);

    await expect(registry.addRegistrySource(registryId, gitUrl, { global: true })).resolves.toMatchObject({
      status: 'added',
    });

    expect(globalConfigManager.addSkillRegistry).toHaveBeenCalledWith(registryId, gitUrl, { force: undefined });
    expect(configManager.getSkillRegistries).toHaveBeenCalledOnce();
  });

  it('does not prepare cache again for an already registered source', async () => {
    const configManager = {
      getSkillRegistries: vi.fn().mockResolvedValue({ [registryId]: gitUrl }),
      addSkillRegistry: vi.fn().mockResolvedValue({}),
    } as unknown as ConfigManager;
    const globalConfigManager = {
      getSkillRegistries: vi.fn().mockResolvedValue({}),
    } as unknown as GlobalConfigManager;
    const registry = new SkillRegistryService(configManager, globalConfigManager);

    await expect(registry.addRegistrySource(registryId, gitUrl)).resolves.toEqual({
      status: 'already-registered',
      registryPath: undefined,
    });

    expect(mockedGit.cloneRepository).not.toHaveBeenCalled();
  });

  it('removes a project registry source', async () => {
    const configManager = {
      getSkillRegistries: vi.fn().mockResolvedValue({ [registryId]: gitUrl }),
      removeSkillRegistry: vi.fn().mockResolvedValue({}),
    } as unknown as ConfigManager;
    const registry = new SkillRegistryService(configManager, {} as GlobalConfigManager);

    await expect(registry.removeRegistrySource(registryId)).resolves.toBe('project');

    expect(configManager.removeSkillRegistry).toHaveBeenCalledWith(registryId);
    expect(mockedFs.remove).not.toHaveBeenCalled();
  });

  it('protects the built-in registry from removal', async () => {
    const registry = new SkillRegistryService({} as ConfigManager, {} as GlobalConfigManager);

    await expect(registry.removeRegistrySource('codeaholicguy/ai-devkit')).rejects.toThrow(/built in/);
  });
});
