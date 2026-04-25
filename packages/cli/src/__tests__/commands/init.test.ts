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
const mockExecFileSync: any = jest.fn();
const mockIsInteractiveTerminal: any = jest.fn();

jest.mock('child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args)
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

jest.mock('../../util/terminal', () => ({
  isInteractiveTerminal: (...args: unknown[]) => mockIsInteractiveTerminal(...args)
}));

import { initCommand } from '../../commands/init';

describe('init command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;

    mockExecFileSync.mockReturnValue(undefined);
    mockPrompt.mockResolvedValue({});

    mockConfigManager.exists.mockResolvedValue(false);
    mockConfigManager.read.mockResolvedValue(null);
    mockConfigManager.create.mockResolvedValue({ environments: [], phases: [] });
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
    mockIsInteractiveTerminal.mockReturnValue(true);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  describe('template mode', () => {
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

    it('silently ignores --built-in when the template declares skills', async () => {
      mockLoadInitTemplate.mockResolvedValue({
        environments: ['codex'],
        phases: ['requirements'],
        skills: [{ registry: 'codeaholicguy/ai-devkit', skill: 'debug' }]
      });

      await initCommand({ template: './init.yaml', builtIn: true });

      expect(mockSkillManager.addSkill).toHaveBeenCalledTimes(1);
      expect(mockSkillManager.addSkill).toHaveBeenCalledWith('codeaholicguy/ai-devkit', 'debug');
      const builtinPrompts = mockPrompt.mock.calls.filter((call: any[]) => {
        const questions = call[0];
        return Array.isArray(questions) && questions.some((q: any) => q?.name === 'installBuiltinSkills');
      });
      expect(builtinPrompts).toHaveLength(0);
    });

    it('silently ignores --built-in when the template has no skills declared', async () => {
      mockLoadInitTemplate.mockResolvedValue({
        environments: ['codex'],
        phases: ['requirements']
      });

      await initCommand({ template: './init.yaml', builtIn: true });

      expect(mockSkillManager.addSkill).not.toHaveBeenCalled();
      const builtinPrompts = mockPrompt.mock.calls.filter((call: any[]) => {
        const questions = call[0];
        return Array.isArray(questions) && questions.some((q: any) => q?.name === 'installBuiltinSkills');
      });
      expect(builtinPrompts).toHaveLength(0);
    });
  });

  describe('built-in skills prompt (interactive init without template)', () => {
    it('installs built-in AI DevKit skills when user confirms the prompt', async () => {
      mockPrompt.mockResolvedValueOnce({ installBuiltinSkills: true });

      await initCommand({});

      const builtinCalls = mockSkillManager.addSkill.mock.calls.filter(
        (call: unknown[]) => call[0] === 'codeaholicguy/ai-devkit'
      );
      expect(builtinCalls.length).toBeGreaterThan(0);
      expect(mockPrompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'confirm',
          name: 'installBuiltinSkills',
          default: true
        })
      ]);
    });

    it('skips installing built-in skills when user declines the prompt', async () => {
      mockPrompt.mockResolvedValueOnce({ installBuiltinSkills: false });

      await initCommand({});

      const builtinPromptCalls = mockPrompt.mock.calls.filter((call: any[]) => {
        const questions = call[0];
        return Array.isArray(questions) && questions.some((q: any) => q?.name === 'installBuiltinSkills');
      });
      expect(builtinPromptCalls.length).toBe(1);
      expect(mockSkillManager.addSkill).not.toHaveBeenCalled();
    });

    it('does not prompt for built-in skills when running in template mode', async () => {
      mockLoadInitTemplate.mockResolvedValue({
        environments: ['codex'],
        phases: ['requirements']
      });

      await initCommand({ template: './init.yaml' });

      const builtinPrompts = mockPrompt.mock.calls.filter((call: any[]) => {
        const questions = call[0];
        if (!Array.isArray(questions)) return false;
        return questions.some((q: any) => q?.name === 'installBuiltinSkills');
      });
      expect(builtinPrompts).toHaveLength(0);
    });

    it('continues init when built-in skill install fails', async () => {
      mockPrompt.mockResolvedValueOnce({ installBuiltinSkills: true });
      mockSkillManager.addSkill.mockRejectedValue(new Error('network down'));

      await expect(initCommand({})).resolves.toBeUndefined();
      expect(mockSkillManager.addSkill).toHaveBeenCalledWith('codeaholicguy/ai-devkit', expect.any(String));
      expect(process.exitCode).not.toBe(1);
    });
  });

  describe('built-in skills in non-interactive environments (CI)', () => {
    it('skips the built-in skills prompt and install when stdin is not a TTY', async () => {
      mockIsInteractiveTerminal.mockReturnValue(false);

      await initCommand({});

      const builtinPrompts = mockPrompt.mock.calls.filter((call: any[]) => {
        const questions = call[0];
        return Array.isArray(questions) && questions.some((q: any) => q?.name === 'installBuiltinSkills');
      });
      expect(builtinPrompts).toHaveLength(0);
      expect(mockSkillManager.addSkill).not.toHaveBeenCalled();
      expect(mockUi.info).toHaveBeenCalledWith(
        expect.stringMatching(/non-interactive|--built-in/)
      );
    });

    it('installs built-in skills without prompting when --built-in is passed in a non-interactive environment', async () => {
      mockIsInteractiveTerminal.mockReturnValue(false);

      await initCommand({ builtIn: true });

      const builtinPrompts = mockPrompt.mock.calls.filter((call: any[]) => {
        const questions = call[0];
        return Array.isArray(questions) && questions.some((q: any) => q?.name === 'installBuiltinSkills');
      });
      expect(builtinPrompts).toHaveLength(0);
      const builtinCalls = mockSkillManager.addSkill.mock.calls.filter(
        (call: unknown[]) => call[0] === 'codeaholicguy/ai-devkit'
      );
      expect(builtinCalls.length).toBeGreaterThan(0);
    });

    it('installs built-in skills without prompting when --built-in is passed in an interactive environment', async () => {
      mockIsInteractiveTerminal.mockReturnValue(true);

      await initCommand({ builtIn: true });

      const builtinPrompts = mockPrompt.mock.calls.filter((call: any[]) => {
        const questions = call[0];
        return Array.isArray(questions) && questions.some((q: any) => q?.name === 'installBuiltinSkills');
      });
      expect(builtinPrompts).toHaveLength(0);
      const builtinCalls = mockSkillManager.addSkill.mock.calls.filter(
        (call: unknown[]) => call[0] === 'codeaholicguy/ai-devkit'
      );
      expect(builtinCalls.length).toBeGreaterThan(0);
    });
  });
});
