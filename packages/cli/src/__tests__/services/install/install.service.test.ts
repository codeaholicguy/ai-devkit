import { jest } from '@jest/globals';

const mockPrompt: any = jest.fn();

const mockConfigManager: any = {
  read: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  addPhase: jest.fn()
};

const mockTemplateManager: any = {
  checkEnvironmentExists: jest.fn(),
  fileExists: jest.fn(),
  setupMultipleEnvironments: jest.fn(),
  copyPhaseTemplate: jest.fn()
};

const mockSkillManager: any = {
  addSkill: jest.fn()
};

jest.mock('inquirer', () => ({
  __esModule: true,
  default: {
    prompt: (...args: unknown[]) => mockPrompt(...args)
  }
}));

jest.mock('../../../lib/Config', () => ({
  ConfigManager: jest.fn(() => mockConfigManager)
}));

jest.mock('../../../lib/TemplateManager', () => ({
  TemplateManager: jest.fn(() => mockTemplateManager)
}));

jest.mock('../../../lib/EnvironmentSelector', () => ({
  EnvironmentSelector: jest.fn()
}));

jest.mock('../../../lib/SkillManager', () => ({
  SkillManager: jest.fn(() => mockSkillManager)
}));

import { getInstallExitCode, reconcileAndInstall } from '../../../services/install/install.service';

describe('install service', () => {
  const installConfig = {
    environments: ['codex' as const],
    phases: ['requirements' as const],
    skills: [{ registry: 'codeaholicguy/ai-devkit', name: 'debug' }]
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigManager.read.mockResolvedValue({
      environments: [],
      phases: []
    });
    mockConfigManager.create.mockResolvedValue({
      environments: [],
      phases: []
    });
    mockConfigManager.update.mockResolvedValue({});
    mockConfigManager.addPhase.mockResolvedValue({});

    mockTemplateManager.checkEnvironmentExists.mockResolvedValue(false);
    mockTemplateManager.fileExists.mockResolvedValue(false);
    mockTemplateManager.setupMultipleEnvironments.mockResolvedValue([]);
    mockTemplateManager.copyPhaseTemplate.mockResolvedValue('docs/ai/requirements/README.md');

    mockSkillManager.addSkill.mockResolvedValue(undefined);
    mockPrompt.mockResolvedValue({ overwrite: false });
  });

  it('installs all sections on happy path', async () => {
    const report = await reconcileAndInstall(installConfig, {});

    expect(mockConfigManager.update).toHaveBeenCalledWith({
      environments: ['codex'],
      phases: ['requirements'],
      skills: [{ registry: 'codeaholicguy/ai-devkit', name: 'debug' }]
    });
    expect(report.environments.installed).toBe(1);
    expect(report.phases.installed).toBe(1);
    expect(report.skills.installed).toBe(1);
    expect(report.warnings).toEqual([]);
  });

  it('prompts and skips conflicting artifacts when overwrite is not confirmed', async () => {
    mockTemplateManager.checkEnvironmentExists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    mockTemplateManager.fileExists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    mockPrompt.mockResolvedValue({ overwrite: false });

    const report = await reconcileAndInstall(installConfig, {});

    expect(mockPrompt).toHaveBeenCalledTimes(1);
    expect(report.environments.skipped).toBe(1);
    expect(report.phases.skipped).toBe(1);
    expect(report.skills.installed).toBe(1);
    expect(mockConfigManager.update).toHaveBeenCalledWith({
      environments: [],
      phases: [],
      skills: [{ registry: 'codeaholicguy/ai-devkit', name: 'debug' }]
    });
  });

  it('overwrites conflicting artifacts when overwrite is confirmed via prompt', async () => {
    mockTemplateManager.checkEnvironmentExists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    mockTemplateManager.fileExists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    mockPrompt.mockResolvedValue({ overwrite: true });

    const report = await reconcileAndInstall(installConfig, {});

    expect(mockPrompt).toHaveBeenCalledTimes(1);
    expect(report.environments.installed).toBe(1);
    expect(report.phases.installed).toBe(1);
  });

  it('auto-overwrites and does not prompt when --overwrite is set', async () => {
    mockTemplateManager.checkEnvironmentExists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    mockTemplateManager.fileExists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    const report = await reconcileAndInstall(installConfig, { overwrite: true });

    expect(mockPrompt).not.toHaveBeenCalled();
    expect(report.environments.installed).toBe(1);
    expect(report.phases.installed).toBe(1);
  });

  it('reports skill failures as warnings and continues', async () => {
    mockSkillManager.addSkill.mockRejectedValue(new Error('network down'));

    const report = await reconcileAndInstall(installConfig, {});

    expect(report.skills.failed).toBe(1);
    expect(report.warnings).toEqual([
      'Skill codeaholicguy/ai-devkit/debug failed: network down'
    ]);
    expect(getInstallExitCode(report)).toBe(0);
  });

  it('returns non-zero exit code when environment or phase failures occur', () => {
    const report = {
      environments: { installed: 0, skipped: 0, failed: 1 },
      phases: { installed: 0, skipped: 0, failed: 0 },
      skills: { installed: 0, skipped: 0, failed: 0 },
      warnings: []
    };

    expect(getInstallExitCode(report)).toBe(1);
  });
});
