

const {
  mockConfigManager,
  mockTemplateManager,
  mockEnvironmentSelector,
  mockPhaseSelector,
  mockSkillManager,
  mockUi,
  mockConfirm,
  mockLoadInitTemplate,
  mockExecFileSync,
  mockIsInteractiveTerminal,
  mockReconcileAndInstall,
  mockGetInstallExitCode,
} = vi.hoisted(() => ({
  mockConfigManager: {
    exists: vi.fn(),
    read: vi.fn(),
    create: vi.fn(),
    setEnvironments: vi.fn(),
    addPhase: vi.fn(),
    update: vi.fn(),
  } as any,
  mockTemplateManager: {
    checkEnvironmentExists: vi.fn(),
    setupMultipleEnvironments: vi.fn(),
    fileExists: vi.fn(),
    copyPhaseTemplate: vi.fn(),
  } as any,
  mockEnvironmentSelector: {
    selectEnvironments: vi.fn(),
    confirmOverride: vi.fn(),
    displaySelectionSummary: vi.fn(),
  } as any,
  mockPhaseSelector: {
    selectPhases: vi.fn(),
    displaySelectionSummary: vi.fn(),
  } as any,
  mockSkillManager: { addSkill: vi.fn() } as any,
  mockUi: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    text: vi.fn(),
    summary: vi.fn(),
  } as any,
  mockConfirm: vi.fn() as any,
  mockLoadInitTemplate: vi.fn() as any,
  mockExecFileSync: vi.fn() as any,
  mockIsInteractiveTerminal: vi.fn() as any,
  mockReconcileAndInstall: vi.fn() as any,
  mockGetInstallExitCode: vi.fn() as any,
}));

vi.mock('../../services/install/install.service.js', () => ({
  reconcileAndInstall: (...args: unknown[]) => mockReconcileAndInstall(...args),
  getInstallExitCode: (...args: unknown[]) => mockGetInstallExitCode(...args)
}));

vi.mock('child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args)
}));

vi.mock('@inquirer/prompts', () => ({
  confirm: (...args: unknown[]) => mockConfirm(...args)
}));

vi.mock('../../lib/Config.js', () => ({
  ConfigManager: vi.fn(function () { return mockConfigManager; })
}));

vi.mock('../../lib/TemplateManager.js', () => ({
  TemplateManager: vi.fn(function () { return mockTemplateManager; })
}));

vi.mock('../../lib/EnvironmentSelector.js', () => ({
  EnvironmentSelector: vi.fn(function () { return mockEnvironmentSelector; })
}));

vi.mock('../../lib/PhaseSelector.js', () => ({
  PhaseSelector: vi.fn(function () { return mockPhaseSelector; })
}));

vi.mock('../../lib/SkillManager.js', () => ({
  SkillManager: vi.fn(function () { return mockSkillManager; })
}));

vi.mock('../../lib/InitTemplate.js', () => ({
  loadInitTemplate: (...args: unknown[]) => mockLoadInitTemplate(...args)
}));

vi.mock('../../util/terminal-ui.js', () => ({
  ui: mockUi
}));

vi.mock('../../util/terminal.js', () => ({
  isInteractiveTerminal: (...args: unknown[]) => mockIsInteractiveTerminal(...args)
}));

import { initCommand } from '../../commands/init.js';
import { BUILTIN_SKILL_NAMES, BUILTIN_SKILL_REGISTRY } from '../../constants.js';
import { SkillManager } from '../../lib/SkillManager.js';

function confirmCallsMatching(pattern: RegExp): any[] {
  return mockConfirm.mock.calls.filter(([config]: any[]) =>
    pattern.test(config?.message ?? '')
  );
}

function appliedConfig(): any {
  return mockReconcileAndInstall.mock.calls.at(-1)?.[0];
}

describe('init command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    mockExecFileSync.mockReturnValue(undefined);
    mockConfirm.mockResolvedValue(false);

    mockConfigManager.exists.mockResolvedValue(false);
    mockConfigManager.read.mockResolvedValue(null);
    mockConfigManager.create.mockResolvedValue({ environments: [], phases: [] });
    mockConfigManager.setEnvironments.mockResolvedValue(undefined);
    mockConfigManager.addPhase.mockResolvedValue(undefined);
    mockConfigManager.update.mockResolvedValue({});

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
    mockReconcileAndInstall.mockResolvedValue({
      environments: { installed: 1, skipped: 0, failed: 0 },
      phases: { installed: 1, skipped: 0, failed: 0 },
      skills: { installed: 0, skipped: 0, failed: 0 },
      mcpServers: { installed: 1, skipped: 0, conflicts: 0, failed: 0 },
      warnings: [], items: [], complete: true
    });
    mockGetInstallExitCode.mockReturnValue(0);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  describe('template mode', () => {
    it('applies template MCP servers through the shared project application service', async () => {
      mockLoadInitTemplate.mockResolvedValue({
        environments: ['codex'],
        phases: ['requirements'],
        mcpServers: {
          memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] }
        }
      });

      await initCommand({ template: './init.yaml' });

      expect(mockReconcileAndInstall).toHaveBeenCalledWith(
        expect.objectContaining({
          environments: ['codex'],
          phases: ['requirements'],
          mcpServers: expect.objectContaining({ memory: expect.any(Object) })
        }),
        expect.objectContaining({ overwrite: undefined, nonInteractive: false })
      );
      expect(mockUi.info).not.toHaveBeenCalledWith(expect.stringContaining('Run `ai-devkit install`'));
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
    expect(mockConfirm).not.toHaveBeenCalled();

    expect(appliedConfig()).toEqual(expect.objectContaining({
      environments: ['codex'],
      phases: ['requirements', 'design'],
      skills: [
        { registry: 'codeaholicguy/ai-devkit', name: 'debug' },
        { registry: 'codeaholicguy/ai-devkit', name: 'memory' }
      ]
    }));
  });

  it('delegates mixed-registry application to the shared install service', async () => {
    mockLoadInitTemplate.mockResolvedValue({
      environments: ['codex'],
      phases: ['requirements'],
      skills: [
        { registry: 'codeaholicguy/ai-devkit', skill: 'debug' },
        { registry: 'anthropics/skills', skill: 'frontend-design' },
        { registry: 'codeaholicguy/ai-devkit', skill: 'memory' },
      ],
    });

    await initCommand({ template: './init.yaml' });

    expect(mockReconcileAndInstall).toHaveBeenCalledTimes(1);
    expect(appliedConfig().skills).toEqual([
      { registry: 'codeaholicguy/ai-devkit', name: 'debug' },
      { registry: 'anthropics/skills', name: 'frontend-design' },
      { registry: 'codeaholicguy/ai-devkit', name: 'memory' },
    ]);
  });


  it('deduplicates template skills before shared application', async () => {
    mockLoadInitTemplate.mockResolvedValue({
      environments: ['codex'],
      phases: ['requirements'],
      skills: [
        { registry: 'codeaholicguy/ai-devkit', skill: 'debug' },
        { registry: 'codeaholicguy/ai-devkit', skill: 'debug' },
        { registry: 'codeaholicguy/ai-devkit', skill: 'memory' }
      ]
    });

    await initCommand({ template: './init.yaml' });

    expect(appliedConfig().skills).toEqual([
      { registry: 'codeaholicguy/ai-devkit', name: 'debug' },
      { registry: 'codeaholicguy/ai-devkit', name: 'memory' }
    ]);
  });

  it('falls back to interactive selection when template omits environments and phases', async () => {
    mockLoadInitTemplate.mockResolvedValue({
      skills: [{ registry: 'codeaholicguy/ai-devkit', skill: 'debug' }]
    });

    await initCommand({ template: './init.yaml' });

    expect(mockEnvironmentSelector.selectEnvironments).toHaveBeenCalledTimes(1);
    expect(mockPhaseSelector.selectPhases).toHaveBeenCalledTimes(1);
    expect(appliedConfig().skills).toContainEqual({ registry: 'codeaholicguy/ai-devkit', name: 'debug' });
  });

  it('keeps existing interactive reconfigure prompt when no template is provided', async () => {
    mockConfigManager.exists.mockResolvedValue(true);
    mockConfirm.mockResolvedValueOnce(false);

    await initCommand({});

    expect(mockConfirm).toHaveBeenCalledTimes(1);
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

    it('installs template skills and all built-in skills when both options are provided', async () => {
      mockLoadInitTemplate.mockResolvedValue({
        environments: ['codex'],
        phases: ['requirements'],
        skills: [{ registry: 'codeaholicguy/ai-devkit', skill: 'debug' }]
      });

      await initCommand({ template: './init.yaml', builtIn: true });

      expect(appliedConfig().skills).toHaveLength(BUILTIN_SKILL_NAMES.length + 1);
      expect(appliedConfig().skills).toContainEqual({ registry: BUILTIN_SKILL_REGISTRY, name: 'debug' });
      for (const skill of BUILTIN_SKILL_NAMES) {
        expect(appliedConfig().skills).toContainEqual({ registry: BUILTIN_SKILL_REGISTRY, name: skill });
      }
      const builtinPrompts = confirmCallsMatching(/Install AI DevKit built-in skills/);
      expect(builtinPrompts).toHaveLength(0);
    });

    it('installs all built-in skills when the template has no skills declared', async () => {
      mockLoadInitTemplate.mockResolvedValue({
        environments: ['codex'],
        phases: ['requirements']
      });

      await initCommand({ template: './init.yaml', builtIn: true });

      expect(appliedConfig().skills).toHaveLength(BUILTIN_SKILL_NAMES.length);
      for (const skill of BUILTIN_SKILL_NAMES) {
        expect(appliedConfig().skills).toContainEqual({ registry: BUILTIN_SKILL_REGISTRY, name: skill });
      }
      const builtinPrompts = confirmCallsMatching(/Install AI DevKit built-in skills/);
      expect(builtinPrompts).toHaveLength(0);
    });
  });

  describe('built-in skills prompt (interactive init without template)', () => {
    it('installs built-in AI DevKit skills when user confirms the prompt', async () => {
      mockConfirm.mockResolvedValueOnce(true);

      await initCommand({});

      expect(appliedConfig().skills.length).toBeGreaterThan(0);
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Install AI DevKit built-in skills'),
          default: true
        })
      );
    });

    it('skips installing built-in skills when user declines the prompt', async () => {
      mockConfirm.mockResolvedValueOnce(false);

      await initCommand({});

      const builtinPromptCalls = confirmCallsMatching(/Install AI DevKit built-in skills/);
      expect(builtinPromptCalls.length).toBe(1);
      expect(mockSkillManager.addSkill).not.toHaveBeenCalled();
    });

    it('does not prompt for built-in skills when running in template mode', async () => {
      mockLoadInitTemplate.mockResolvedValue({
        environments: ['codex'],
        phases: ['requirements']
      });

      await initCommand({ template: './init.yaml' });

      const builtinPrompts = confirmCallsMatching(/Install AI DevKit built-in skills/);
      expect(builtinPrompts).toHaveLength(0);
    });

    it('reports incomplete init when shared skill application fails', async () => {
      mockConfirm.mockResolvedValueOnce(true);
      mockReconcileAndInstall.mockResolvedValue({
        environments: { installed: 1, skipped: 0, failed: 0 },
        phases: { installed: 1, skipped: 0, failed: 0 },
        skills: { installed: 0, skipped: 0, failed: 1 },
        mcpServers: { installed: 0, skipped: 0, conflicts: 0, failed: 0 },
        warnings: ['network down'], items: [], complete: false
      });
      mockGetInstallExitCode.mockReturnValue(1);

      await expect(initCommand({})).resolves.toBeUndefined();
      expect(process.exitCode).toBe(1);
      expect(mockUi.warning).toHaveBeenCalledWith(expect.stringContaining('setup is incomplete'));
    });
  });

  describe('built-in skills in non-interactive environments (CI)', () => {
    it('skips the built-in skills prompt and install when stdin is not a TTY', async () => {
      mockIsInteractiveTerminal.mockReturnValue(false);

      await initCommand({});

      const builtinPrompts = confirmCallsMatching(/Install AI DevKit built-in skills/);
      expect(builtinPrompts).toHaveLength(0);
      expect(mockSkillManager.addSkill).not.toHaveBeenCalled();
      expect(mockUi.info).toHaveBeenCalledWith(
        expect.stringMatching(/non-interactive|--built-in/)
      );
    });

    it('installs built-in skills without prompting when --built-in is passed in a non-interactive environment', async () => {
      mockIsInteractiveTerminal.mockReturnValue(false);

      await initCommand({ builtIn: true });

      const builtinPrompts = confirmCallsMatching(/Install AI DevKit built-in skills/);
      expect(builtinPrompts).toHaveLength(0);
      expect(appliedConfig().skills.length).toBeGreaterThan(0);
    });

    it('installs built-in skills without prompting when --built-in is passed in an interactive environment', async () => {
      mockIsInteractiveTerminal.mockReturnValue(true);

      await initCommand({ builtIn: true });

      const builtinPrompts = confirmCallsMatching(/Install AI DevKit built-in skills/);
      expect(builtinPrompts).toHaveLength(0);
      expect(appliedConfig().skills.length).toBeGreaterThan(0);
    });
  });

  describe('non-interactive (--yes)', () => {
    it('does not issue any prompts for a complete non-interactive run', async () => {
      await initCommand({ yes: true, all: true, environment: 'claude' });

      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockEnvironmentSelector.selectEnvironments).not.toHaveBeenCalled();
      expect(mockPhaseSelector.selectPhases).toHaveBeenCalledWith(true, undefined);
      expect(mockReconcileAndInstall).toHaveBeenCalledWith(
        expect.any(Object), expect.objectContaining({ nonInteractive: true })
      );
    });
    it('exits 1 with a clear error when --yes is passed without -e (and no template)', async () => {
      await initCommand({ yes: true, all: true });

      expect(process.exitCode).toBe(1);
      expect(mockUi.error).toHaveBeenCalledWith(
        expect.stringMatching(/Non-interactive mode requires --environment/)
      );
      expect(mockEnvironmentSelector.selectEnvironments).not.toHaveBeenCalled();
      expect(mockConfigManager.create).not.toHaveBeenCalled();
    });

    it('exits 1 with a clear error when --yes is passed without -a/-p (and no template)', async () => {
      await initCommand({ yes: true, environment: 'claude' });

      expect(process.exitCode).toBe(1);
      expect(mockUi.error).toHaveBeenCalledWith(
        expect.stringMatching(/Non-interactive mode requires --all or --phases/)
      );
      expect(mockPhaseSelector.selectPhases).not.toHaveBeenCalled();
      expect(mockConfigManager.create).not.toHaveBeenCalled();
    });

    it('does not prompt to reconfigure when --yes is set and config already exists', async () => {
      mockConfigManager.exists.mockResolvedValue(true);

      await initCommand({ yes: true, all: true, environment: 'claude' });

      const reconfigurePrompts = confirmCallsMatching(/already initialized.*reconfigure/);
      expect(reconfigurePrompts).toHaveLength(0);
      expect(process.exitCode).not.toBe(1);
    });

    it('skips overwriting existing environments under --yes without --overwrite', async () => {
      mockTemplateManager.checkEnvironmentExists.mockResolvedValue(true);

      await initCommand({ yes: true, all: true, environment: 'claude' });

      expect(mockEnvironmentSelector.confirmOverride).not.toHaveBeenCalled();
      expect(mockTemplateManager.setupMultipleEnvironments).not.toHaveBeenCalled();
      expect(mockUi.warning).toHaveBeenCalledWith(
        expect.stringMatching(/Skipping overwrite of existing environments/)
      );
    });

    it('overwrites existing environments under --yes when --overwrite is passed', async () => {
      mockTemplateManager.checkEnvironmentExists.mockResolvedValue(true);

      await initCommand({ yes: true, overwrite: true, all: true, environment: 'claude' });

      expect(mockEnvironmentSelector.confirmOverride).not.toHaveBeenCalled();
      expect(mockReconcileAndInstall).toHaveBeenCalled();
      expect(mockUi.warning).toHaveBeenCalledWith(
        expect.stringMatching(/Overwriting existing environments/)
      );
    });

    it('skips existing phase files under --yes without --overwrite (no prompt)', async () => {
      mockTemplateManager.fileExists.mockResolvedValue(true);

      await initCommand({ yes: true, all: true, environment: 'claude' });

      const overwritePrompts = confirmCallsMatching(/already exists\. Overwrite\?/);
      expect(overwritePrompts).toHaveLength(0);
      expect(mockTemplateManager.copyPhaseTemplate).not.toHaveBeenCalled();
      expect(mockReconcileAndInstall).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
        overwrite: undefined,
        nonInteractive: true
      }));
    });

    it('overwrites existing phase files under --yes --overwrite (no prompt)', async () => {
      mockTemplateManager.fileExists.mockResolvedValue(true);

      await initCommand({ yes: true, overwrite: true, all: true, environment: 'claude' });

      const overwritePrompts = confirmCallsMatching(/already exists\. Overwrite\?/);
      expect(overwritePrompts).toHaveLength(0);
      expect(mockReconcileAndInstall).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
        overwrite: true,
        nonInteractive: true
      }));
    });

    it('skips the built-in skills install under --yes without --built-in (TTY attached)', async () => {
      mockIsInteractiveTerminal.mockReturnValue(true);

      await initCommand({ yes: true, all: true, environment: 'claude' });

      const builtinPrompts = confirmCallsMatching(/Install AI DevKit built-in skills/);
      expect(builtinPrompts).toHaveLength(0);
      expect(mockSkillManager.addSkill).not.toHaveBeenCalled();
    });

    it('installs built-in skills under --yes when --built-in is also passed', async () => {
      mockIsInteractiveTerminal.mockReturnValue(true);

      await initCommand({ yes: true, builtIn: true, all: true, environment: 'claude' });

      expect(appliedConfig().skills.length).toBeGreaterThan(0);
    });
  });
});
