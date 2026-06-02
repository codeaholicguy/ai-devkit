import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerSelectedCommand,
  resolveLightweightCliResponse,
  resolveTopLevelCommandModule,
  runSelectedCommand,
} from '../../cli-runtime.js';

const mocks = vi.hoisted(() => ({
  initCommand: vi.fn(),
  phaseCommand: vi.fn(),
  setupCommand: vi.fn(),
  lintCommand: vi.fn(),
  installCommand: vi.fn(),
  registerMemoryCommand: vi.fn(),
  registerSkillCommand: vi.fn(),
  registerAgentCommand: vi.fn(),
  registerChannelCommand: vi.fn(),
  registerDocsCommand: vi.fn(),
}));

vi.mock('../../commands/init.js', () => ({ initCommand: mocks.initCommand }));
vi.mock('../../commands/phase.js', () => ({ phaseCommand: mocks.phaseCommand }));
vi.mock('../../commands/setup.js', () => ({ setupCommand: mocks.setupCommand }));
vi.mock('../../commands/lint.js', () => ({ lintCommand: mocks.lintCommand }));
vi.mock('../../commands/install.js', () => ({ installCommand: mocks.installCommand }));
vi.mock('../../commands/memory.js', () => ({ registerMemoryCommand: mocks.registerMemoryCommand }));
vi.mock('../../commands/skill.js', () => ({ registerSkillCommand: mocks.registerSkillCommand }));
vi.mock('../../commands/agent.js', () => ({ registerAgentCommand: mocks.registerAgentCommand }));
vi.mock('../../commands/channel.js', () => ({ registerChannelCommand: mocks.registerChannelCommand }));
vi.mock('../../commands/docs.js', () => ({ registerDocsCommand: mocks.registerDocsCommand }));

describe('CLI runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prints version without loading the full command graph', () => {
    expect(resolveLightweightCliResponse(['--version'], '1.2.3')).toEqual({
      handled: true,
      output: '1.2.3\n',
    });
  });

  it('prints root help without loading the full command graph', () => {
    const response = resolveLightweightCliResponse(['--help'], '1.2.3');

    expect(response.handled).toBe(true);
    expect(response.output).toContain('Usage: ai-devkit [options] [command]');
    expect(response.output).toContain('agent');
  });

  it('prints top-level command help without loading the full command graph', () => {
    const response = resolveLightweightCliResponse(['memory', '--help'], '1.2.3');

    expect(response.handled).toBe(true);
    expect(response.output).toContain('Usage: ai-devkit memory [options] [command]');
    expect(response.output).toContain('store');
    expect(response.output).toContain('search');
  });

  it('prints command-specific options for option-bearing commands', () => {
    const response = resolveLightweightCliResponse(['lint', '--help'], '1.2.3');

    expect(response.handled).toBe(true);
    expect(response.output).toContain('-f, --feature <name>');
    expect(response.output).toContain('--json');
  });

  it('prints all static top-level subcommands for grouped command help', () => {
    const response = resolveLightweightCliResponse(['channel', '--help'], '1.2.3');

    expect(response.handled).toBe(true);
    expect(response.output).toContain('connect [options] <type>');
    expect(response.output).toContain('stop [name]');
    expect(response.output).toContain('status [name]');
  });

  it('delegates non-help command execution to the command runner', () => {
    expect(resolveLightweightCliResponse(['lint'], '1.2.3')).toEqual({ handled: false });
  });

  it('maps selected top-level commands to their command modules', () => {
    expect(resolveTopLevelCommandModule(['lint'])).toBe('./commands/lint.js');
    expect(resolveTopLevelCommandModule(['memory', 'search'])).toBe('./commands/memory.js');
    expect(resolveTopLevelCommandModule(['agent', 'list'])).toBe('./commands/agent.js');
  });

  it('does not map root help or unknown commands', () => {
    expect(resolveTopLevelCommandModule(['--help'])).toBeUndefined();
    expect(resolveTopLevelCommandModule(['unknown'])).toBeUndefined();
  });

  it('registers inline top-level commands with their lazy handlers', async () => {
    const cases = [
      { modulePath: './commands/init.js' as const, name: 'init', action: mocks.initCommand },
      { modulePath: './commands/phase.js' as const, name: 'phase', action: mocks.phaseCommand },
      { modulePath: './commands/setup.js' as const, name: 'setup', action: mocks.setupCommand },
      { modulePath: './commands/lint.js' as const, name: 'lint', action: mocks.lintCommand },
      { modulePath: './commands/install.js' as const, name: 'install', action: mocks.installCommand },
    ];

    for (const testCase of cases) {
      const program = new Command();

      await registerSelectedCommand(program, testCase.modulePath);

      const command = program.commands.find((registeredCommand) => registeredCommand.name() === testCase.name);
      expect(command).toBeDefined();
      expect(command?.description()).not.toBe('');

      await program.parseAsync(['node', 'ai-devkit', testCase.name]);

      expect(testCase.action).toHaveBeenCalled();
      vi.clearAllMocks();
    }
  });

  it('delegates grouped commands to their command registration modules', async () => {
    const cases = [
      { modulePath: './commands/memory.js' as const, register: mocks.registerMemoryCommand },
      { modulePath: './commands/skill.js' as const, register: mocks.registerSkillCommand },
      { modulePath: './commands/agent.js' as const, register: mocks.registerAgentCommand },
      { modulePath: './commands/channel.js' as const, register: mocks.registerChannelCommand },
      { modulePath: './commands/docs.js' as const, register: mocks.registerDocsCommand },
    ];

    for (const testCase of cases) {
      const program = new Command();

      await registerSelectedCommand(program, testCase.modulePath);

      expect(testCase.register).toHaveBeenCalledWith(program);
    }
  });

  it('runs the selected command through a lightweight program', async () => {
    await runSelectedCommand(['node', 'ai-devkit', 'lint'], '1.2.3');

    expect(mocks.lintCommand).toHaveBeenCalled();
  });
});
