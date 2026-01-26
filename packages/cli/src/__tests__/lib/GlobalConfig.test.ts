import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { GlobalConfigManager } from '../../lib/GlobalConfig';

jest.mock('fs-extra');
jest.mock('os');
jest.mock('path');

describe('GlobalConfigManager', () => {
  let configManager: GlobalConfigManager;
  let mockFs: jest.Mocked<typeof fs>;
  let mockOs: jest.Mocked<typeof os>;
  let mockPath: jest.Mocked<typeof path>;

  beforeEach(() => {
    configManager = new GlobalConfigManager();
    mockFs = fs as jest.Mocked<typeof fs>;
    mockOs = os as jest.Mocked<typeof os>;
    mockPath = path as jest.Mocked<typeof path>;

    mockOs.homedir.mockReturnValue('/home/test');
    mockPath.join.mockImplementation((...args) => args.join('/'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('read', () => {
    it('should return null when global config does not exist', async () => {
      (mockFs.pathExists as any).mockResolvedValue(false);

      const result = await configManager.read();

      expect(result).toBeNull();
      expect(mockFs.readJson).not.toHaveBeenCalled();
    });

    it('should return parsed config when file exists', async () => {
      const config = {
        skills: {
          registries: {
            'my-org/skills': 'https://github.com/my-org/skills.git'
          }
        }
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.read();

      expect(result).toEqual(config);
      expect(mockFs.readJson).toHaveBeenCalledWith('/home/test/.ai-devkit/.ai-devkit.json');
    });

    it('should warn and return null when JSON is invalid', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockRejectedValue(new Error('Invalid JSON'));

      const result = await configManager.read();

      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('getSkillRegistries', () => {
    it('should return empty map when no config', async () => {
      (mockFs.pathExists as any).mockResolvedValue(false);

      const result = await configManager.getSkillRegistries();

      expect(result).toEqual({});
    });

    it('should return only string registry entries', async () => {
      const config = {
        skills: {
          registries: {
            'my-org/skills': 'https://github.com/my-org/skills.git',
            'bad/entry': 123
          }
        }
      };

      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue(config);

      const result = await configManager.getSkillRegistries();

      expect(result).toEqual({
        'my-org/skills': 'https://github.com/my-org/skills.git'
      });
    });
  });
});
