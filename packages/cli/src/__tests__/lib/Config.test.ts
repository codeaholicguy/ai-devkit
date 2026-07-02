import type { Mocked } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { ConfigManager } from '../../lib/Config.js';
import { DevKitConfig } from '../../types.js';

vi.mock('fs-extra', () => {
  const m = {
    pathExists: vi.fn(), readJson: vi.fn(), writeJson: vi.fn(),
    readFile: vi.fn(), writeFile: vi.fn(), ensureDir: vi.fn(),
    ensureFile: vi.fn(), readdir: vi.fn(), stat: vi.fn(),
    copy: vi.fn(), copyFile: vi.fn(), remove: vi.fn(),
    move: vi.fn(), outputFile: vi.fn(), outputJson: vi.fn(),
    emptyDir: vi.fn(),
  };
  return { ...m, default: m };
});
vi.mock('path', () => {
  const m = {
    join: vi.fn(),
    dirname: vi.fn(),
    resolve: vi.fn(),
    isAbsolute: vi.fn(),
    basename: vi.fn(),
    extname: vi.fn(),
    sep: '/',
    delimiter: ':',
    parse: vi.fn(),
    format: vi.fn(),
    normalize: vi.fn(),
    relative: vi.fn(),
    posix: {} as any,
    win32: {} as any,
  };
  return { ...m, default: m };
});
vi.mock('../../../package.json', () => ({
  default: { version: '1.0.0' },
}));

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let mockFs: Mocked<typeof fs>;
  let mockPath: Mocked<typeof path>;

  beforeEach(() => {
    configManager = new ConfigManager('/test/dir');
    mockFs = fs as Mocked<typeof fs>;
    mockPath = path as Mocked<typeof path>;
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.dirname.mockImplementation((input: string) => input.split('/').slice(0, -1).join('/') || '/');
    mockPath.resolve.mockImplementation((...args) => args.join('/').replace(/\/+/g, '/'));
    mockPath.isAbsolute.mockImplementation((input: string) => input.startsWith('/'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set correct config path', () => {
      expect(mockPath.join).toHaveBeenCalledWith('/test/dir', '.ai-devkit.json');
    });

    it('should use current directory as default', () => {
      new ConfigManager();
      expect(mockPath.join).toHaveBeenCalledWith(process.cwd(), '.ai-devkit.json');
    });
  });

  describe('exists', () => {
    it('should return true when config file exists', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);

      const result = await configManager.exists();

      expect(result).toBe(true);
      expect(mockFs.pathExists).toHaveBeenCalledWith('/test/dir/.ai-devkit.json');
    });

    it('should return false when config file does not exist', async () => {
      (mockFs.pathExists as any).mockResolvedValue(false);

      const result = await configManager.exists();

      expect(result).toBe(false);
    });
  });

  describe('read', () => {
    it('should return parsed config when file exists', async () => {
      const mockConfig: DevKitConfig = {
        version: '1.0.0',
        environments: ['cursor' as any],
        phases: ['requirements' as any],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(mockConfig);

      const result = await configManager.read();

      expect(result).toEqual(mockConfig);
      expect(mockFs.readJson).toHaveBeenCalledWith('/test/dir/.ai-devkit.json');
    });

    it('should return null when file does not exist', async () => {
      (mockFs.pathExists as any).mockResolvedValue(false);

      const result = await configManager.read();

      expect(result).toBeNull();
      expect(mockFs.readJson).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create config with default values', async () => {
      const expectedConfig: DevKitConfig = {
        version: '1.0.0',
        environments: [],
        phases: [],
        createdAt: expect.any(String),
      };

      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.create();

      expect(result).toEqual(expectedConfig);
      expect(mockFs.writeJson).toHaveBeenCalledWith(
        '/test/dir/.ai-devkit.json',
        expectedConfig,
        { spaces: 2 }
      );
      expect(result).not.toHaveProperty('updatedAt');
    });
  });

  describe('update', () => {
    it('should update existing config without adding updatedAt', async () => {
      const existingConfig: DevKitConfig = {
        version: '1.0.0',
        environments: ['cursor'],
        phases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      const updates = { environments: ['cursor' as any, 'claude' as any] };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(existingConfig);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.update(updates);

      expect(result.environments).toEqual(['cursor', 'claude']);
      expect(result.createdAt).toBe(existingConfig.createdAt);
      expect(result).not.toHaveProperty('updatedAt');
    });

    it('should not rewrite config when updates are unchanged and updatedAt is absent', async () => {
      const existingConfig: DevKitConfig = {
        version: '1.0.0',
        environments: ['cursor'],
        phases: [],
        skills: [{ registry: 'codeaholicguy/ai-devkit', name: 'debug' }],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(existingConfig);

      const result = await configManager.update({
        environments: ['cursor'],
        skills: [{ registry: 'codeaholicguy/ai-devkit', name: 'debug' }]
      });

      expect(result).toEqual(existingConfig);
      expect(mockFs.writeJson).not.toHaveBeenCalled();
    });

    it('should not rewrite config when only legacy updatedAt is present and updates are unchanged', async () => {
      const existingConfig = {
        version: '1.0.0',
        environments: ['cursor'],
        phases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(existingConfig);

      const result = await configManager.update({});

      expect(result).toEqual(existingConfig);
      expect(mockFs.writeJson).not.toHaveBeenCalled();
    });

    it('should throw error when config file not found', async () => {
      (mockFs.readJson as any).mockResolvedValue(null);

      await expect(configManager.update({})).rejects.toThrow(
        'Config file not found. Run ai-devkit init first.'
      );
    });
  });

  describe('addPhase', () => {
    it('should add new phase to phases', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: [],
        phases: ['requirements'],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.addPhase('design');

      expect(result.phases).toEqual(['requirements', 'design']);
    });

    it('should not add duplicate phase', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: [],
        phases: ['requirements'],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.addPhase('requirements');

      expect(result.phases).toEqual(['requirements']);
      expect(mockFs.writeJson).not.toHaveBeenCalled();
    });

    it('should initialize phases when phases field is missing', async () => {
      const configWithoutPhases = {
        version: '1.0.0',
        environments: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(configWithoutPhases);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.addPhase('requirements');

      expect(result.phases).toEqual(['requirements']);
    });
  });

  describe('hasPhase', () => {
    it('should return true when phase exists', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: [],
        phases: ['requirements', 'design'],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.hasPhase('design');

      expect(result).toBe(true);
    });

    it('should return false when phase does not exist', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: [],
        phases: ['requirements'],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.hasPhase('design');

      expect(result).toBe(false);
    });

    it('should return false when config does not exist', async () => {
      (mockFs.pathExists as any).mockResolvedValue(false);

      const result = await configManager.hasPhase('requirements');

      expect(result).toBe(false);
    });

    it('should return false when phases field is missing', async () => {
      const configWithoutPhases = {
        version: '1.0.0',
        environments: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(configWithoutPhases);

      const result = await configManager.hasPhase('requirements');

      expect(result).toBe(false);
    });
  });

  describe('getDocsDir', () => {
    it('should return custom docsDir when set in config', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        paths: { docs: '.ai-docs' },
        environments: [],
        phases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.getDocsDir();

      expect(result).toBe('.ai-docs');
    });

    it('should return default docs/ai when docsDir is not set', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: [],
        phases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.getDocsDir();

      expect(result).toBe('docs/ai');
    });

    it('should return default docs/ai when config does not exist', async () => {
      (mockFs.pathExists as any).mockResolvedValue(false);

      const result = await configManager.getDocsDir();

      expect(result).toBe('docs/ai');
    });
  });

  describe('getPhases', () => {
    it('should return configured phases when config exists', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: [],
        phases: ['requirements', 'deployment'],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.getPhases();

      expect(result).toEqual(['requirements', 'deployment']);
    });

    it('should return default lifecycle phases when config has no phases', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: [],
        phases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.getPhases();

      expect(result).toEqual(['requirements', 'design', 'planning', 'implementation', 'testing']);
    });
  });

  describe('setDocsDir', () => {
    it('should update docsDir in config', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: [],
        phases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.setDocsDir('.ai-docs');

      expect(result.paths?.docs).toBe('.ai-docs');
      expect(mockFs.writeJson).toHaveBeenCalled();
    });
  });

  describe('getEnvironments', () => {
    it('should return environments array when config exists', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: ['cursor', 'claude'],
        phases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.getEnvironments();

      expect(result).toEqual(['cursor', 'claude']);
    });

    it('should return empty array when config does not exist', async () => {
      (mockFs.pathExists as any).mockResolvedValue(false);

      const result = await configManager.getEnvironments();

      expect(result).toEqual([]);
    });

    it('should return empty array when environments field is missing', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: [],
        phases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.getEnvironments();

      expect(result).toEqual([]);
    });
  });

  describe('setEnvironments', () => {
    it('should update environments and return config', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: ['cursor'],
        phases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.setEnvironments(['cursor', 'claude']);

      expect(result.environments).toEqual(['cursor', 'claude']);
      expect(mockFs.writeJson).toHaveBeenCalled();
    });
  });

  describe('hasEnvironment', () => {
    it('should return true when environment exists', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: ['cursor', 'claude'],
        phases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.hasEnvironment('claude');

      expect(result).toBe(true);
    });

    it('should return false when environment does not exist', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: ['cursor'],
        phases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.hasEnvironment('claude');

      expect(result).toBe(false);
    });
  });

  describe('addSkill', () => {
    it('adds a new skill entry to config', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: ['cursor'],
        phases: [],
        skills: [{ registry: 'codeaholicguy/ai-devkit', name: 'debug' }],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.addSkill({
        registry: 'codeaholicguy/ai-devkit',
        name: 'memory'
      });

      expect(result.skills).toEqual([
        { registry: 'codeaholicguy/ai-devkit', name: 'debug' },
        { registry: 'codeaholicguy/ai-devkit', name: 'memory' }
      ]);
      expect(mockFs.writeJson).toHaveBeenCalled();
    });

    it('does not add duplicate skill entry', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: ['cursor'],
        phases: [],
        skills: [{ registry: 'codeaholicguy/ai-devkit', name: 'debug' }],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.addSkill({
        registry: 'codeaholicguy/ai-devkit',
        name: 'debug'
      });

      expect(result.skills).toEqual([{ registry: 'codeaholicguy/ai-devkit', name: 'debug' }]);
      expect(mockFs.writeJson).not.toHaveBeenCalled();
    });

    it('adds skill when skills is undefined', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: ['cursor'],
        phases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.addSkill({
        registry: 'codeaholicguy/ai-devkit',
        name: 'memory'
      });

      expect(result.skills).toEqual([
        { registry: 'codeaholicguy/ai-devkit', name: 'memory' }
      ]);
      expect(mockFs.writeJson).toHaveBeenCalled();
    });
  });

  describe('removeSkill', () => {
    it('removes the skill entry from the skills array', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: ['claude'],
        phases: [],
        skills: [
          { registry: 'codeaholicguy/ai-devkit', name: 'dev-lifecycle' },
          { registry: 'codeaholicguy/ai-devkit', name: 'memory' }
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.removeSkill('dev-lifecycle');

      expect(result.skills).toEqual([
        { registry: 'codeaholicguy/ai-devkit', name: 'memory' }
      ]);
      expect(mockFs.writeJson).toHaveBeenCalled();
    });

    it('results in an empty array when last skill is removed', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: ['claude'],
        phases: [],
        skills: [
          { registry: 'codeaholicguy/ai-devkit', name: 'dev-lifecycle' }
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.removeSkill('dev-lifecycle');

      expect(result.skills).toEqual([]);
      expect(mockFs.writeJson).toHaveBeenCalled();
    });

    it('is a no-op when skill name does not exist', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: ['claude'],
        phases: [],
        skills: [
          { registry: 'codeaholicguy/ai-devkit', name: 'memory' }
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.removeSkill('nonexistent');

      expect(result.skills).toEqual([
        { registry: 'codeaholicguy/ai-devkit', name: 'memory' }
      ]);
    });

    it('throws when config file is not found', async () => {
      (mockFs.pathExists as any).mockResolvedValue(false);

      await expect(configManager.removeSkill('dev-lifecycle')).rejects.toThrow(
        'Config file not found'
      );
    });
  });

  describe('getSkillRegistries', () => {
    it('returns registries from top-level registries field', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue({
        version: '1.0.0',
        environments: ['cursor'],
        phases: [],
        registries: {
          'my-org/skills': 'https://github.com/my-org/skills.git',
          'invalid/value': false
        },
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const registries = await configManager.getSkillRegistries();

      expect(registries).toEqual({
        'my-org/skills': 'https://github.com/my-org/skills.git'
      });
    });

    it('returns empty object when no registries field exists', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue({
        version: '1.0.0',
        environments: ['cursor'],
        phases: [],
        skills: [{ registry: 'codeaholicguy/ai-devkit', name: 'debug' }],
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const registries = await configManager.getSkillRegistries();

      expect(registries).toEqual({});
    });
  });

  describe('getMemoryDbPath', () => {
    it('returns undefined when config does not exist', async () => {
      (mockFs.pathExists as any).mockResolvedValue(false);

      const result = await configManager.getMemoryDbPath();

      expect(result).toBeUndefined();
    });

    it('returns undefined when memory.path is missing', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue({
        version: '1.0.0',
        environments: [],
        phases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const result = await configManager.getMemoryDbPath();

      expect(result).toBeUndefined();
    });

    it('returns undefined when memory.path is blank or invalid', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue({
        version: '1.0.0',
        environments: [],
        phases: [],
        memory: { path: '   ' },
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      await expect(configManager.getMemoryDbPath()).resolves.toBeUndefined();

      (mockFs.readJson as any).mockResolvedValue({
        version: '1.0.0',
        environments: [],
        phases: [],
        memory: { path: 42 },
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      await expect(configManager.getMemoryDbPath()).resolves.toBeUndefined();
    });

    it('returns absolute memory.path as-is', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue({
        version: '1.0.0',
        environments: [],
        phases: [],
        memory: { path: '/custom/memory.db' },
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const result = await configManager.getMemoryDbPath();

      expect(result).toBe('/custom/memory.db');
      expect(mockPath.isAbsolute).toHaveBeenCalledWith('/custom/memory.db');
    });

    it('resolves relative memory.path from the config directory', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue({
        version: '1.0.0',
        environments: [],
        phases: [],
        memory: { path: '.ai-devkit/project-memory.db' },
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const result = await configManager.getMemoryDbPath();

      expect(mockPath.dirname).toHaveBeenCalledWith('/test/dir/.ai-devkit.json');
      expect(mockPath.resolve).toHaveBeenCalledWith('/test/dir', '.ai-devkit/project-memory.db');
      expect(result).toBe('/test/dir/.ai-devkit/project-memory.db');
    });
  });

});
