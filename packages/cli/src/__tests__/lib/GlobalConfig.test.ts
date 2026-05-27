import type { Mocked } from 'vitest';
import fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { GlobalConfigManager } from '../../lib/GlobalConfig.js';

vi.mock('fs-extra', async () => { const { makeFsExtraMock } = await import('../__shared__/fs-extra-mock.js'); return makeFsExtraMock(); });
vi.mock('os');
vi.mock('path');

vi.mock('../../util/terminal-ui.js', () => ({
  ui: { warning: vi.fn(), info: vi.fn(), error: vi.fn(), text: vi.fn() },
}));
import { ui as mockUi } from '../../util/terminal-ui.js';

describe('GlobalConfigManager', () => {
  let configManager: GlobalConfigManager;
  let mockFs: Mocked<typeof fs>;
  let mockOs: Mocked<typeof os>;
  let mockPath: Mocked<typeof path>;

  beforeEach(() => {
    configManager = new GlobalConfigManager();
    mockFs = fs as Mocked<typeof fs>;
    mockOs = os as Mocked<typeof os>;
    mockPath = path as Mocked<typeof path>;

    mockOs.homedir.mockReturnValue('/home/test');
    mockPath.join.mockImplementation((...args) => args.join('/'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
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
        registries: {
          'my-org/skills': 'https://github.com/my-org/skills.git'
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
      expect(mockUi.warning).toHaveBeenCalled();
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
        registries: {
          'my-org/skills': 'https://github.com/my-org/skills.git',
          'bad/entry': 123
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
