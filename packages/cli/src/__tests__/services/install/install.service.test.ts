

const mockPrompt: any = vi.fn();

const mockConfigManager: any = {
  read: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  addPhase: vi.fn(),
  getDocsDir: vi.fn()
};

const mockTemplateManager: any = {
  checkEnvironmentExists: vi.fn(),
  fileExists: vi.fn(),
  setupMultipleEnvironments: vi.fn(),
  copyPhaseTemplate: vi.fn()
};

const mockSkillManager: any = {
  addSkill: vi.fn()
};

vi.mock('inquirer', () => ({
  __esModule: true,
  default: {
    prompt: (...args: unknown[]) => mockPrompt(...args)
  }
}));

vi.mock('../../../lib/Config.js', () => ({
  ConfigManager: vi.fn(() => mockConfigManager)
}));

vi.mock('../../../lib/TemplateManager.js', () => ({
  TemplateManager: vi.fn(() => mockTemplateManager)
}));

vi.mock('../../../lib/EnvironmentSelector.js', () => ({
  EnvironmentSelector: vi.fn()
}));

vi.mock('../../../lib/SkillManager.js', () => ({
  SkillManager: vi.fn(() => mockSkillManager)
}));

import { getInstallExitCode, reconcileAndInstall } from '../../../services/install/install.service.js';

describe('install service', () => {
  const installConfig = {
    environments: ['codex' as const],
    phases: ['requirements' as const],
    registries: {},
    skills: [{ registry: 'codeaholicguy/ai-devkit', name: 'debug' }],
    mcpServers: {}
  };

  beforeEach(() => {
    vi.clearAllMocks();

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
    mockConfigManager.getDocsDir.mockResolvedValue('docs/ai');

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
      skills: [{ registry: 'codeaholicguy/ai-devkit', name: 'debug' }],
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
      skills: [{ registry: 'codeaholicguy/ai-devkit', name: 'debug' }],
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

  it('does not add skills field to config when no skills are in the install config (issue #64)', async () => {
    const configWithoutSkills = {
      environments: ['codex' as const],
      phases: ['requirements' as const],
      registries: {},
      skills: [],
      mcpServers: {}
    };

    const report = await reconcileAndInstall(configWithoutSkills, {});

    expect(report.skills.installed).toBe(0);
    expect(mockConfigManager.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ skills: expect.anything() })
    );
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
      mcpServers: { installed: 0, skipped: 0, conflicts: 0, failed: 0 },
      warnings: []
    };

    expect(getInstallExitCode(report)).toBe(1);
  });
});
