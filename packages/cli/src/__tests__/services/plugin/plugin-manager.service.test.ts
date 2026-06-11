import { createPluginManager } from '../../../services/plugin/plugin-manager.service.js';

describe('plugin manager service', () => {
  const packageService = () => ({
    ensureGlobalNpmProject: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
    uninstall: vi.fn().mockResolvedValue(undefined),
  });

  const configManager = () => ({
    addPlugin: vi.fn().mockResolvedValue({ plugins: ['@ai-devkit/memory-dashboard'] }),
    removePlugin: vi.fn().mockResolvedValue({ plugins: [] }),
    getPlugins: vi.fn().mockResolvedValue(['@ai-devkit/memory-dashboard']),
  });

  it('installs, validates, and persists a plugin', async () => {
    const packages = packageService();
    const config = configManager();
    const validateInstalledPlugin = vi.fn().mockResolvedValue(undefined);
    const manager = createPluginManager({ packages, config, validateInstalledPlugin });

    await manager.add(' @ai-devkit/memory-dashboard ');

    expect(packages.install).toHaveBeenCalledWith('@ai-devkit/memory-dashboard');
    expect(validateInstalledPlugin).toHaveBeenCalledWith('@ai-devkit/memory-dashboard');
    expect(config.addPlugin).toHaveBeenCalledWith('@ai-devkit/memory-dashboard');
  });

  it('uninstalls and does not persist a plugin when validation fails after install', async () => {
    const packages = packageService();
    const config = configManager();
    const validateInstalledPlugin = vi.fn().mockRejectedValue(new Error('missing manifest'));
    const manager = createPluginManager({ packages, config, validateInstalledPlugin });

    await expect(manager.add('@ai-devkit/bad-plugin')).rejects.toThrow('missing manifest');

    expect(packages.install).toHaveBeenCalledWith('@ai-devkit/bad-plugin');
    expect(packages.uninstall).toHaveBeenCalledWith('@ai-devkit/bad-plugin');
    expect(config.addPlugin).not.toHaveBeenCalled();
  });

  it('reports rollback failure details when validation and uninstall both fail', async () => {
    const packages = packageService();
    packages.uninstall.mockRejectedValue(new Error('rollback failed'));
    const config = configManager();
    const validateInstalledPlugin = vi.fn().mockRejectedValue(new Error('missing manifest'));
    const manager = createPluginManager({ packages, config, validateInstalledPlugin });

    await expect(manager.add('@ai-devkit/bad-plugin')).rejects.toThrow('missing manifest Rollback uninstall also failed: rollback failed');
  });

  it('removes a plugin from npm and global config', async () => {
    const packages = packageService();
    const config = configManager();
    const manager = createPluginManager({
      packages,
      config,
      validateInstalledPlugin: vi.fn(),
    });

    await manager.remove(' @ai-devkit/memory-dashboard ');

    expect(packages.uninstall).toHaveBeenCalledWith('@ai-devkit/memory-dashboard');
    expect(config.removePlugin).toHaveBeenCalledWith('@ai-devkit/memory-dashboard');
  });

  it('rejects invalid package names before installing', async () => {
    const packages = packageService();
    const config = configManager();
    const manager = createPluginManager({
      packages,
      config,
      validateInstalledPlugin: vi.fn(),
    });

    await expect(manager.add('@ai-devkit/memory-dashboard@1.0.0')).rejects.toThrow('Only npm package names are supported for plugins.');

    expect(packages.install).not.toHaveBeenCalled();
    expect(config.addPlugin).not.toHaveBeenCalled();
  });

  it('lists configured plugins with validation status', async () => {
    const manager = createPluginManager({
      packages: packageService(),
      config: configManager(),
      validateInstalledPlugin: vi.fn().mockResolvedValue(undefined),
    });

    const result = await manager.list();

    expect(result).toEqual([
      {
        name: '@ai-devkit/memory-dashboard',
        status: 'valid',
        error: undefined,
      }
    ]);
  });

  it('lists invalid configured plugins with the validation error', async () => {
    const manager = createPluginManager({
      packages: packageService(),
      config: configManager(),
      validateInstalledPlugin: vi.fn().mockRejectedValue(new Error('not installed')),
    });

    const result = await manager.list();

    expect(result).toEqual([
      {
        name: '@ai-devkit/memory-dashboard',
        status: 'invalid',
        error: 'not installed',
      }
    ]);
  });
});
