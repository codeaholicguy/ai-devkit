import type { Mocked } from 'vitest';
import fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { createAiDevkitRuntime } from '../../../services/plugin/runtime.js';

vi.mock('fs-extra', async () => { const { makeFsExtraMock } = await import('../../__shared__/fs-extra-mock.js'); return makeFsExtraMock(); });
vi.mock('os');
vi.mock('path');

vi.mock('../../../util/terminal-ui.js', () => ({
  ui: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

describe('plugin runtime', () => {
  let mockFs: Mocked<typeof fs>;
  let mockOs: Mocked<typeof os>;
  let mockPath: Mocked<typeof path>;

  beforeEach(() => {
    mockFs = fs as Mocked<typeof fs>;
    mockOs = os as Mocked<typeof os>;
    mockPath = path as Mocked<typeof path>;

    mockOs.homedir.mockReturnValue('/home/test');
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.dirname.mockImplementation((input: string) => input.split('/').slice(0, -1).join('/') || '/');
    mockPath.resolve.mockImplementation((...args) => args.join('/').replace(/\/+/g, '/'));
    mockPath.isAbsolute.mockImplementation((input: string) => input.startsWith('/'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('provides cwd, homeDir, configPath, and global config access', async () => {
    (mockFs.pathExists as any).mockResolvedValue(true);
    (mockFs.readJson as any).mockResolvedValue({
      plugins: ['@ai-devkit/memory-dashboard']
    });

    const runtime = createAiDevkitRuntime({ cwd: '/project' });

    expect(runtime.cwd).toBe('/project');
    expect(runtime.homeDir).toBe('/home/test');
    expect(runtime.configPath).toBe('/home/test/.ai-devkit/.ai-devkit.json');
    await expect(runtime.getConfig()).resolves.toEqual({
      plugins: ['@ai-devkit/memory-dashboard']
    });
  });

  it('resolves relative memory db paths from the global config directory', async () => {
    (mockFs.pathExists as any).mockResolvedValue(true);
    (mockFs.readJson as any).mockResolvedValue({
      memory: {
        path: 'memory.db'
      }
    });

    const runtime = createAiDevkitRuntime({ cwd: '/project' });

    await expect(runtime.getMemoryDbPath()).resolves.toBe('/home/test/.ai-devkit/memory.db');
  });

  it('returns the default memory db path when memory db path is not configured', async () => {
    (mockFs.pathExists as any).mockResolvedValue(true);
    (mockFs.readJson as any).mockResolvedValue({});

    const runtime = createAiDevkitRuntime({ cwd: '/project' });

    await expect(runtime.getMemoryDbPath()).resolves.toBe('/home/test/.ai-devkit/memory.db');
  });
});
