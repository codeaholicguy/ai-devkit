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
    mockPath.dirname.mockImplementation((input: string) => input.split('/').slice(0, -1).join('/') || '/');
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

  describe('getPlugins', () => {
    it('should return empty list when no config exists', async () => {
      (mockFs.pathExists as any).mockResolvedValue(false);

      const result = await configManager.getPlugins();

      expect(result).toEqual([]);
    });

    it('should return only string plugin entries', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue({
        plugins: ['@ai-devkit/memory-dashboard', 123, '', '  @ai-devkit/agent-office  ']
      });

      const result = await configManager.getPlugins();

      expect(result).toEqual(['@ai-devkit/memory-dashboard', '@ai-devkit/agent-office']);
    });
  });

  describe('addPlugin', () => {
    it('creates global config and adds the first plugin', async () => {
      (mockFs.pathExists as any).mockResolvedValue(false);
      (mockFs.ensureDir as any).mockResolvedValue(undefined);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.addPlugin('@ai-devkit/memory-dashboard');

      expect(result.plugins).toEqual(['@ai-devkit/memory-dashboard']);
      expect(mockFs.ensureDir).toHaveBeenCalledWith('/home/test/.ai-devkit');
      expect(mockFs.writeJson).toHaveBeenCalledWith(
        '/home/test/.ai-devkit/.ai-devkit.json',
        { plugins: ['@ai-devkit/memory-dashboard'] },
        { spaces: 2 }
      );
    });

    it('deduplicates plugin entries when adding an existing plugin', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue({
        registries: { 'owner/repo': 'https://example.com/repo.git' },
        plugins: ['@ai-devkit/memory-dashboard']
      });
      (mockFs.ensureDir as any).mockResolvedValue(undefined);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.addPlugin('@ai-devkit/memory-dashboard');

      expect(result.plugins).toEqual(['@ai-devkit/memory-dashboard']);
      expect(mockFs.writeJson).toHaveBeenCalledWith(
        '/home/test/.ai-devkit/.ai-devkit.json',
        {
          registries: { 'owner/repo': 'https://example.com/repo.git' },
          plugins: ['@ai-devkit/memory-dashboard']
        },
        { spaces: 2 }
      );
    });
  });

  describe('removePlugin', () => {
    it('removes plugin entries while preserving unrelated config', async () => {
      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readJson as any).mockResolvedValue({
        registries: { 'owner/repo': 'https://example.com/repo.git' },
        plugins: ['@ai-devkit/memory-dashboard', '@ai-devkit/agent-office']
      });
      (mockFs.ensureDir as any).mockResolvedValue(undefined);
      (mockFs.writeJson as any).mockResolvedValue(undefined);

      const result = await configManager.removePlugin('@ai-devkit/memory-dashboard');

      expect(result.plugins).toEqual(['@ai-devkit/agent-office']);
      expect(mockFs.writeJson).toHaveBeenCalledWith(
        '/home/test/.ai-devkit/.ai-devkit.json',
        {
          registries: { 'owner/repo': 'https://example.com/repo.git' },
          plugins: ['@ai-devkit/agent-office']
        },
        { spaces: 2 }
      );
    });
  });
});
