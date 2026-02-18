import { jest } from '@jest/globals';

const mockConfigManager: any = {
  exists: jest.fn(),
  read: jest.fn(),
  create: jest.fn(),
  setEnvironments: jest.fn(),
  addPhase: jest.fn()
};

const mockTemplateManager: any = {
  checkEnvironmentExists: jest.fn(),
  setupMultipleEnvironments: jest.fn(),
  fileExists: jest.fn(),
  copyPhaseTemplate: jest.fn()
};

const mockEnvironmentSelector: any = {
  selectEnvironments: jest.fn(),
  confirmOverride: jest.fn(),
  displaySelectionSummary: jest.fn()
};

const mockPhaseSelector: any = {
  selectPhases: jest.fn(),
  displaySelectionSummary: jest.fn()
};

const mockSkillManager: any = {
  addSkill: jest.fn()
};

const mockUi: any = {
  warning: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  info: jest.fn(),
  text: jest.fn()
};

const mockPrompt: any = jest.fn();
const mockLoadInitTemplate: any = jest.fn();
const mockExecSync: any = jest.fn();

jest.mock('child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args)
}));

jest.mock('inquirer', () => ({
  __esModule: true,
  default: {
    prompt: (...args: unknown[]) => mockPrompt(...args)
  }
}));

jest.mock('../../lib/Config', () => ({
  ConfigManager: jest.fn(() => mockConfigManager)
}));

jest.mock('../../lib/TemplateManager', () => ({
  TemplateManager: jest.fn(() => mockTemplateManager)
}));

jest.mock('../../lib/EnvironmentSelector', () => ({
  EnvironmentSelector: jest.fn(() => mockEnvironmentSelector)
}));

jest.mock('../../lib/PhaseSelector', () => ({
  PhaseSelector: jest.fn(() => mockPhaseSelector)
}));

jest.mock('../../lib/SkillManager', () => ({
  SkillManager: jest.fn(() => mockSkillManager)
}));

jest.mock('../../lib/InitTemplate', () => ({
  loadInitTemplate: (...args: unknown[]) => mockLoadInitTemplate(...args)
}));

jest.mock('../../util/terminal-ui', () => ({
  ui: mockUi
}));

import { initCommand } from '../../commands/init';

describe('init command template mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;

    mockExecSync.mockReturnValue(undefined);
    mockPrompt.mockResolvedValue({});

    mockConfigManager.exists.mockResolvedValue(false);
    mockConfigManager.read.mockResolvedValue(null);
    mockConfigManager.create.mockResolvedValue({ environments: [], initializedPhases: [] });
    mockConfigManager.setEnvironments.mockResolvedValue(undefined);
    mockConfigManager.addPhase.mockResolvedValue(undefined);

    mockTemplateManager.checkEnvironmentExists.mockResolvedValue(false);
    mockTemplateManager.setupMultipleEnvironments.mockResolvedValue(['AGENTS.md']);
    mockTemplateManager.fileExists.mockResolvedValue(false);
    mockTemplateManager.copyPhaseTemplate.mockResolvedValue('docs/ai/requirements/README.md');

    mockEnvironmentSelector.selectEnvironments.mockResolvedValue(['codex']);
    mockEnvironmentSelector.confirmOverride.mockResolvedValue(true);

    mockPhaseSelector.selectPhases.mockResolvedValue(['requirements']);

    mockSkillManager.addSkill.mockResolvedValue(undefined);
    mockLoadInitTemplate.mockResolvedValue({});
  });

  it('uses template values and installs multiple skills from same registry without prompts', async () => {
    mockLoadInitTemplate.mockResolvedValue({
      environments: ['codex'],
      phases: ['requirements', 'design'],
      skills: [
        { registry: 'codeaholicguy/ai-devkit', skill: 'debug' },
        { registry: 'codeaholicguy/ai-devkit', skill: 'memory' }
      ]
    });

    await initCommand({ template: './init.yaml' });

    expect(mockLoadInitTemplate).toHaveBeenCalledWith('./init.yaml');
    expect(mockEnvironmentSelector.selectEnvironments).not.toHaveBeenCalled();
    expect(mockPhaseSelector.selectPhases).not.toHaveBeenCalled();
    expect(mockPrompt).not.toHaveBeenCalled();

    expect(mockConfigManager.setEnvironments).toHaveBeenCalledWith(['codex']);
    expect(mockTemplateManager.copyPhaseTemplate).toHaveBeenCalledTimes(2);
    expect(mockSkillManager.addSkill).toHaveBeenCalledTimes(2);
    expect(mockSkillManager.addSkill).toHaveBeenNthCalledWith(1, 'codeaholicguy/ai-devkit', 'debug');
    expect(mockSkillManager.addSkill).toHaveBeenNthCalledWith(2, 'codeaholicguy/ai-devkit', 'memory');
  });

  it('continues on skill failures and skips duplicate registry+skill entries', async () => {
    mockLoadInitTemplate.mockResolvedValue({
      environments: ['codex'],
      phases: ['requirements'],
      skills: [
        { registry: 'codeaholicguy/ai-devkit', skill: 'debug' },
        { registry: 'codeaholicguy/ai-devkit', skill: 'debug' },
        { registry: 'codeaholicguy/ai-devkit', skill: 'memory' }
      ]
    });

    mockSkillManager.addSkill
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('network failed'));

    await initCommand({ template: './init.yaml' });

    expect(mockSkillManager.addSkill).toHaveBeenCalledTimes(2);
    expect(mockUi.warning).toHaveBeenCalledWith('Skipped 1 duplicate skill entry(ies) from template.');
    expect(mockUi.warning).toHaveBeenCalledWith(
      '1 skill install(s) failed. Continuing with warnings as configured.'
    );
  });

  it('falls back to interactive selection when template omits environments and phases', async () => {
    mockLoadInitTemplate.mockResolvedValue({
      skills: [{ registry: 'codeaholicguy/ai-devkit', skill: 'debug' }]
    });

    await initCommand({ template: './init.yaml' });

    expect(mockEnvironmentSelector.selectEnvironments).toHaveBeenCalledTimes(1);
    expect(mockPhaseSelector.selectPhases).toHaveBeenCalledTimes(1);
    expect(mockSkillManager.addSkill).toHaveBeenCalledWith('codeaholicguy/ai-devkit', 'debug');
  });

  it('keeps existing interactive reconfigure prompt when no template is provided', async () => {
    mockConfigManager.exists.mockResolvedValue(true);
    mockPrompt.mockResolvedValueOnce({ shouldContinue: false });

    await initCommand({});

    expect(mockPrompt).toHaveBeenCalledTimes(1);
    expect(mockLoadInitTemplate).not.toHaveBeenCalled();
    expect(mockUi.warning).toHaveBeenCalledWith('Initialization cancelled.');
  });

  it('sets non-zero exit code when template loading fails', async () => {
    mockLoadInitTemplate.mockRejectedValue(new Error('Invalid template at /tmp/init.yaml: bad field'));

    await initCommand({ template: '/tmp/init.yaml' });

    expect(mockUi.error).toHaveBeenCalledWith('Invalid template at /tmp/init.yaml: bad field');
    expect(process.exitCode).toBe(1);
    expect(mockConfigManager.setEnvironments).not.toHaveBeenCalled();
  });
});
