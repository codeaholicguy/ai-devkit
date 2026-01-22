import * as fs from 'fs-extra';
import * as path from 'path';
import { ConfigManager } from '../../lib/Config';
import { DevKitConfig } from '../../types';

jest.mock('fs-extra');
jest.mock('path');
jest.mock('../../../package.json', () => ({
  version: '1.0.0'
}));

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let mockFs: jest.Mocked<typeof fs>;
  let mockPath: jest.Mocked<typeof path>;

  beforeEach(() => {
    configManager = new ConfigManager('/test/dir');
    mockFs = fs as jest.Mocked<typeof fs>;
    mockPath = path as jest.Mocked<typeof path>;
    mockPath.join.mockImplementation((...args) => args.join('/'));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should set correct config path', () => {
      expect(mockPath.join).toHaveBeenCalledWith('/test/dir', '.ai-devkit.json');
    });

    it('should use current directory as default', () => {
      const defaultConfig = new ConfigManager();
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
        initializedPhases: ['requirements' as any],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
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
        initializedPhases: [],
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      };

      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.create();

      expect(result).toEqual(expectedConfig);
      expect(mockFs.writeJson).toHaveBeenCalledWith(
        '/test/dir/.ai-devkit.json',
        expectedConfig,
        { spaces: 2 }
      );
    });
  });

  describe('update', () => {
    it('should update existing config and set updatedAt', async () => {
      const existingConfig: DevKitConfig = {
        version: '1.0.0',
        environments: ['cursor'],
        initializedPhases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      const updates = { environments: ['cursor' as any, 'claude' as any] };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(existingConfig);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.update(updates);

      expect(result.environments).toEqual(['cursor', 'claude']);
      expect(result.updatedAt).not.toBe(existingConfig.updatedAt);
      expect(result.createdAt).toBe(existingConfig.createdAt);
    });

    it('should throw error when config file not found', async () => {
      (mockFs.readJson as any).mockResolvedValue(null);

      await expect(configManager.update({})).rejects.toThrow(
        'Config file not found. Run ai-devkit init first.'
      );
    });
  });

  describe('addPhase', () => {
    it('should add new phase to initializedPhases', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: [],
        initializedPhases: ['requirements'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.addPhase('design');

      expect(result.initializedPhases).toEqual(['requirements', 'design']);
    });

    it('should not add duplicate phase', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: [],
        initializedPhases: ['requirements'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.addPhase('requirements');

      expect(result.initializedPhases).toEqual(['requirements']);
      expect(mockFs.writeJson).not.toHaveBeenCalled();
    });
  });

  describe('hasPhase', () => {
    it('should return true when phase exists', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: [],
        initializedPhases: ['requirements', 'design'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
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
        initializedPhases: ['requirements'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
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
  });

  describe('getEnvironments', () => {
    it('should return environments array when config exists', async () => {
      const config: DevKitConfig = {
        version: '1.0.0',
        environments: ['cursor', 'claude'],
        initializedPhases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
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
        initializedPhases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
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
        initializedPhases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
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
        initializedPhases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
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
        initializedPhases: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.hasEnvironment('claude');

      expect(result).toBe(false);
    });
  });
});
