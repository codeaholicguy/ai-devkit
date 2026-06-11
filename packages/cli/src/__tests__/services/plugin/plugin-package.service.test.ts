import type { Mocked } from 'vitest';
import fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import {
  createPluginPackageService,
  getGlobalPluginNpmRoot,
} from '../../../services/plugin/plugin-package.service.js';

vi.mock('fs-extra', async () => { const { makeFsExtraMock } = await import('../../__shared__/fs-extra-mock.js'); return makeFsExtraMock(); });
vi.mock('os');
vi.mock('path');

describe('plugin package service', () => {
  let mockFs: Mocked<typeof fs>;
  let mockOs: Mocked<typeof os>;
  let mockPath: Mocked<typeof path>;
  let runNpm: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFs = fs as Mocked<typeof fs>;
    mockOs = os as Mocked<typeof os>;
    mockPath = path as Mocked<typeof path>;
    runNpm = vi.fn().mockResolvedValue(undefined);

    mockOs.homedir.mockReturnValue('/home/test');
    mockPath.join.mockImplementation((...args) => args.join('/'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the global plugin npm root under ~/.ai-devkit/npm', () => {
    expect(getGlobalPluginNpmRoot()).toBe('/home/test/.ai-devkit/npm');
  });

  it('creates package.json when preparing the global npm root for the first time', async () => {
    (mockFs.pathExists as any).mockResolvedValue(false);
    (mockFs.ensureDir as any).mockResolvedValue(undefined);
    (mockFs.writeJson as any).mockResolvedValue(undefined);

    const service = createPluginPackageService({ runNpm });

    await service.ensureGlobalNpmProject();

    expect(mockFs.ensureDir).toHaveBeenCalledWith('/home/test/.ai-devkit/npm');
    expect(mockFs.writeJson).toHaveBeenCalledWith(
      '/home/test/.ai-devkit/npm/package.json',
      {
        private: true,
        type: 'module',
        dependencies: {}
      },
      { spaces: 2 }
    );
  });

  it('does not overwrite an existing package.json', async () => {
    (mockFs.pathExists as any).mockResolvedValue(true);

    const service = createPluginPackageService({ runNpm });

    await service.ensureGlobalNpmProject();

    expect(mockFs.writeJson).not.toHaveBeenCalled();
  });

  it('installs a plugin package with npm using argument arrays', async () => {
    (mockFs.pathExists as any).mockResolvedValue(true);

    const service = createPluginPackageService({ runNpm });

    await service.install('@ai-devkit/memory-dashboard');

    expect(runNpm).toHaveBeenCalledWith(['install', '@ai-devkit/memory-dashboard'], {
      cwd: '/home/test/.ai-devkit/npm'
    });
  });

  it('uninstalls a plugin package with npm using argument arrays', async () => {
    (mockFs.pathExists as any).mockResolvedValue(true);

    const service = createPluginPackageService({ runNpm });

    await service.uninstall('@ai-devkit/memory-dashboard');

    expect(runNpm).toHaveBeenCalledWith(['uninstall', '@ai-devkit/memory-dashboard'], {
      cwd: '/home/test/.ai-devkit/npm'
    });
  });

  it('wraps npm install failures with plugin context', async () => {
    (mockFs.pathExists as any).mockResolvedValue(true);
    runNpm.mockRejectedValue(new Error('network down'));

    const service = createPluginPackageService({ runNpm });

    await expect(service.install('@ai-devkit/memory-dashboard'))
      .rejects.toThrow('Failed to install plugin package @ai-devkit/memory-dashboard: network down');
  });

  it('wraps npm uninstall failures with plugin context', async () => {
    (mockFs.pathExists as any).mockResolvedValue(true);
    runNpm.mockRejectedValue(new Error('permission denied'));

    const service = createPluginPackageService({ runNpm });

    await expect(service.uninstall('@ai-devkit/memory-dashboard'))
      .rejects.toThrow('Failed to uninstall plugin package @ai-devkit/memory-dashboard: permission denied');
  });

  it('rejects empty package names before running npm', async () => {
    const service = createPluginPackageService({ runNpm });

    await expect(service.install('   ')).rejects.toThrow('Plugin package name must be a non-empty npm package name.');

    expect(runNpm).not.toHaveBeenCalled();
  });

  it('rejects package names that look like local paths before running npm', async () => {
    const service = createPluginPackageService({ runNpm });

    await expect(service.install('./memory-dashboard')).rejects.toThrow('Only npm package names are supported for plugins.');

    expect(runNpm).not.toHaveBeenCalled();
  });

  it('rejects package specs with explicit versions before running npm', async () => {
    const service = createPluginPackageService({ runNpm });

    await expect(service.install('@ai-devkit/memory-dashboard@1.0.0'))
      .rejects.toThrow('Only npm package names are supported for plugins.');
    await expect(service.install('memory-dashboard@1.0.0'))
      .rejects.toThrow('Only npm package names are supported for plugins.');

    expect(runNpm).not.toHaveBeenCalled();
  });

  it('rejects package names with unsafe path segments before running npm', async () => {
    const service = createPluginPackageService({ runNpm });

    await expect(service.install('@ai-devkit/../memory-dashboard'))
      .rejects.toThrow('Only npm package names are supported for plugins.');
    await expect(service.install('ai-devkit/memory-dashboard'))
      .rejects.toThrow('Only npm package names are supported for plugins.');

    expect(runNpm).not.toHaveBeenCalled();
  });
});
