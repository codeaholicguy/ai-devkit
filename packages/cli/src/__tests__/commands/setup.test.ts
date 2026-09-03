import { Command } from 'commander';

const {
  mockSetupService,
  mockInspectTmux,
  mockResolveTmuxInstallInstructions,
  mockUi,
} = vi.hoisted(() => ({
  mockSetupService: {
    run: vi.fn(),
  },
  mockInspectTmux: vi.fn(),
  mockResolveTmuxInstallInstructions: vi.fn(),
  mockUi: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    text: vi.fn(),
    summary: vi.fn(),
    table: vi.fn(),
  },
}));

vi.mock('../../util/tmux.js', () => ({
  inspectTmux: mockInspectTmux,
  resolveTmuxInstallInstructions: mockResolveTmuxInstallInstructions,
}));

vi.mock('../../util/tmux-deps.js', () => ({ createTmuxInspectionDeps: () => ({}) }));

vi.mock('../../services/setup/setup.service.js', () => ({
  createSetupService: () => mockSetupService,
  SUPPORTED_SETUP_AGENTS: ['codex', 'pi'],
}));

vi.mock('../../util/terminal-ui.js', () => ({
  ui: mockUi,
}));

import { registerSetupCommand } from '../../commands/setup.js';

describe('setup command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    mockSetupService.run.mockResolvedValue({
      results: [
        {
          agent: 'codex',
          step: 'codex-session-hook',
          status: 'installed',
          message: 'Installed Codex SessionStart hook.',
        },
        {
          agent: 'pi',
          step: 'pi-session-tracker',
          status: 'skipped',
          message: '~/.pi does not exist.',
        },
      ],
    });
    mockInspectTmux.mockResolvedValue({ state: 'available', version: '3.4', rawVersion: 'tmux 3.4' });
    mockResolveTmuxInstallInstructions.mockResolvedValue({ command: 'brew install tmux', message: 'Install it with: brew install tmux.' });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers setup and runs all configured agent setup steps by default', async () => {
    const program = new Command();
    registerSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup']);

    expect(mockSetupService.run).toHaveBeenCalledWith({ agents: undefined });
    expect(mockUi.text).toHaveBeenCalledWith('Host Prerequisites');
    expect(mockUi.success).toHaveBeenCalledWith('tmux 3.4 available');
    expect(mockUi.summary).toHaveBeenCalledWith({
      title: 'Setup Summary',
      items: [
        { type: 'success', count: 1, label: 'step(s) installed' },
        { type: 'warning', count: 1, label: 'step(s) skipped' },
        { type: 'error', count: 0, label: 'step(s) failed' },
      ],
    });
    expect(mockUi.table).toHaveBeenCalledWith({
      headers: ['agent', 'step', 'status', 'message'],
      rows: [
        ['codex', 'codex-session-hook', 'installed', 'Installed Codex SessionStart hook.'],
        ['pi', 'pi-session-tracker', 'skipped', '~/.pi does not exist.'],
      ],
    });
    expect(process.exitCode).toBe(0);
  });

  it('warns with platform-aware instructions and continues setup when tmux is missing', async () => {
    mockInspectTmux.mockResolvedValue({ state: 'missing', version: null, rawVersion: null });
    mockResolveTmuxInstallInstructions.mockResolvedValue({
      command: 'sudo apt-get update && sudo apt-get install tmux',
      message: 'Install it with: sudo apt-get update && sudo apt-get install tmux.',
    });
    const program = new Command();
    registerSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup']);

    expect(mockUi.text).toHaveBeenCalledWith('Next steps');
    expect(mockUi.warning).toHaveBeenCalledWith(
      'Next step: install tmux (sudo apt-get update && sudo apt-get install tmux), then run ai-devkit setup again to start managed agents.',
    );
    expect(mockInspectTmux.mock.invocationCallOrder[0]).toBeLessThan(mockSetupService.run.mock.invocationCallOrder[0]);
    expect(mockUi.table.mock.invocationCallOrder[0]).toBeLessThan(mockUi.text.mock.invocationCallOrder[0]);
    expect(mockUi.table.mock.invocationCallOrder[0]).toBeLessThan(mockUi.warning.mock.invocationCallOrder[0]);
    expect(mockSetupService.run).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(0);
  });

  it('warns and continues setup when tmux cannot be executed', async () => {
    mockInspectTmux.mockResolvedValue({ state: 'error', version: null, rawVersion: 'permission denied' });
    const program = new Command();
    registerSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup']);

    expect(mockUi.text).toHaveBeenCalledWith('Next steps');
    expect(mockUi.warning).toHaveBeenCalledWith(
      'tmux check could not run (permission denied) — verify tmux works before starting agents.',
    );
    expect(mockInspectTmux.mock.invocationCallOrder[0]).toBeLessThan(mockSetupService.run.mock.invocationCallOrder[0]);
    expect(mockUi.table.mock.invocationCallOrder[0]).toBeLessThan(mockUi.warning.mock.invocationCallOrder[0]);
    expect(mockSetupService.run).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(0);
  });

  it('passes selected agents to the setup service', async () => {
    const program = new Command();
    registerSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup', '--agent', 'codex,pi']);

    expect(mockSetupService.run).toHaveBeenCalledWith({ agents: ['codex', 'pi'] });
  });

  it('fails for unsupported agents before running setup', async () => {
    const program = new Command();
    registerSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup', '--agent', 'cursor']);

    expect(mockSetupService.run).not.toHaveBeenCalled();
    expect(mockUi.error).toHaveBeenCalledWith('Unsupported setup agent: cursor. Supported agents: codex, pi.');
    expect(process.exitCode).toBe(1);
  });
});
