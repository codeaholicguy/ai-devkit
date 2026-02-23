import { jest } from '@jest/globals';

const mockLoadAndValidateInstallConfig: any = jest.fn();
const mockLoadConfigFile: any = jest.fn();
const mockReconcileAndInstall: any = jest.fn();
const mockGetInstallExitCode: any = jest.fn();

const mockUi: any = {
  warning: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  info: jest.fn(),
  text: jest.fn(),
  summary: jest.fn()
};

jest.mock('../../services/install/install.service', () => ({
  reconcileAndInstall: (...args: unknown[]) => mockReconcileAndInstall(...args),
  getInstallExitCode: (...args: unknown[]) => mockGetInstallExitCode(...args)
}));

jest.mock('../../services/config/config.service', () => ({
  loadConfigFile: (...args: unknown[]) => mockLoadConfigFile(...args)
}));

jest.mock('../../util/config', () => ({
  validateInstallConfig: (...args: unknown[]) => mockLoadAndValidateInstallConfig(...args)
}));

jest.mock('../../util/terminal-ui', () => ({
  ui: mockUi
}));

import { installCommand } from '../../commands/install';

describe('install command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;

    mockGetInstallExitCode.mockReturnValue(0);
    mockReconcileAndInstall.mockResolvedValue({
      environments: { installed: 1, skipped: 0, failed: 0 },
      phases: { installed: 1, skipped: 0, failed: 0 },
      skills: { installed: 1, skipped: 0, failed: 0 },
      warnings: []
    });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('fails with non-zero exit code when config loading fails', async () => {
    mockLoadConfigFile.mockRejectedValue(new Error('Config file not found: /tmp/.ai-devkit.json'));

    await installCommand({});

    expect(mockUi.error).toHaveBeenCalledWith('Config file not found: /tmp/.ai-devkit.json');
    expect(process.exitCode).toBe(1);
    expect(mockReconcileAndInstall).not.toHaveBeenCalled();
  });

  it('fails when config has no installable sections', async () => {
    mockLoadConfigFile.mockResolvedValue({
      configPath: '/tmp/.ai-devkit.json',
      data: {}
    });
    mockLoadAndValidateInstallConfig.mockReturnValue({
      environments: [],
      phases: [],
      skills: []
    });

    await installCommand({});

    expect(mockUi.warning).toHaveBeenCalledWith('No installable entries found in /tmp/.ai-devkit.json.');
    expect(process.exitCode).toBe(1);
    expect(mockReconcileAndInstall).not.toHaveBeenCalled();
  });

  it('runs install and sets exit code from orchestrator', async () => {
    mockLoadConfigFile.mockResolvedValue({
      configPath: '/tmp/.ai-devkit.json',
      data: {}
    });
    mockLoadAndValidateInstallConfig.mockReturnValue({
      environments: ['codex'],
      phases: ['requirements'],
      skills: [{ registry: 'codeaholicguy/ai-devkit', name: 'debug' }]
    });
    mockGetInstallExitCode.mockReturnValue(0);

    await installCommand({ overwrite: true });

    expect(mockReconcileAndInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        environments: ['codex'],
        phases: ['requirements']
      }),
      { overwrite: true }
    );
    expect(mockUi.summary).toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it('fails with non-zero exit code when reconcile step throws', async () => {
    mockLoadConfigFile.mockResolvedValue({
      configPath: '/tmp/.ai-devkit.json',
      data: {}
    });
    mockLoadAndValidateInstallConfig.mockReturnValue({
      environments: ['codex'],
      phases: ['requirements'],
      skills: []
    });
    mockReconcileAndInstall.mockRejectedValue(new Error('install failed'));

    await installCommand({});

    expect(mockUi.error).toHaveBeenCalledWith('install failed');
    expect(process.exitCode).toBe(1);
  });
});
