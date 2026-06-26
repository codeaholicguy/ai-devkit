import { Command } from 'commander';

const {
  mockSetupService,
  mockUi,
} = vi.hoisted(() => ({
  mockSetupService: {
    run: vi.fn(),
  },
  mockUi: {
    error: vi.fn(),
    summary: vi.fn(),
    table: vi.fn(),
  },
}));

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
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers setup and runs all configured agent setup steps by default', async () => {
    const program = new Command();
    registerSetupCommand(program);

    await program.parseAsync(['node', 'test', 'setup']);

    expect(mockSetupService.run).toHaveBeenCalledWith({ agents: undefined });
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
