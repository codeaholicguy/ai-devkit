import { Command } from 'commander';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AgentManager, AgentStatus, TerminalFocusManager } from '@ai-devkit/agent-manager';
import { registerAgentCommand } from '../../commands/agent';
import { ui } from '../../util/terminal-ui';

const mockManager: any = {
  registerAdapter: jest.fn(),
  listAgents: jest.fn(),
  resolveAgent: jest.fn(),
};

const mockFocusManager: any = {
  findTerminal: jest.fn(),
  focusTerminal: jest.fn(),
};

const mockSpinner: any = {
  start: jest.fn(),
  succeed: jest.fn(),
  fail: jest.fn(),
};

const mockPrompt: any = jest.fn();

jest.mock('@ai-devkit/agent-manager', () => ({
  AgentManager: jest.fn(() => mockManager),
  ClaudeCodeAdapter: jest.fn(),
  TerminalFocusManager: jest.fn(() => mockFocusManager),
  AgentStatus: {
    RUNNING: 'running',
    WAITING: 'waiting',
    IDLE: 'idle',
    UNKNOWN: 'unknown',
  },
}));

jest.mock('inquirer', () => ({
  __esModule: true,
  default: {
    prompt: (...args: unknown[]) => mockPrompt(...args),
  },
}));

jest.mock('../../util/terminal-ui', () => ({
  ui: {
    text: jest.fn(),
    table: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    breakline: jest.fn(),
    spinner: jest.fn(() => mockSpinner),
  },
}));

describe('agent command', () => {
  let logSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('outputs JSON for list --json', async () => {
    const now = new Date('2026-02-26T10:00:00.000Z');
    const agents = [
      {
        name: 'repo-a',
        status: AgentStatus.RUNNING,
        summary: 'Working',
        lastActive: now,
        pid: 123,
      },
    ];
    mockManager.listAgents.mockResolvedValue(agents);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'list', '--json']);

    expect(AgentManager).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(agents, null, 2));
  });

  it('shows info when no agents are running', async () => {
    mockManager.listAgents.mockResolvedValue([]);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'list']);

    expect(ui.info).toHaveBeenCalledWith('No running agents detected.');
    expect(ui.table).not.toHaveBeenCalled();
  });

  it('renders table and waiting summary for list', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-02-26T10:00:00.000Z').getTime());
    mockManager.listAgents.mockResolvedValue([
      {
        name: 'repo-a',
        status: AgentStatus.WAITING,
        summary: 'Need input',
        lastActive: new Date('2026-02-26T10:00:00.000Z'),
        pid: 100,
      },
      {
        name: 'repo-b',
        status: AgentStatus.IDLE,
        summary: '',
        lastActive: new Date('2026-02-26T09:55:00.000Z'),
        pid: 101,
      },
    ]);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'list']);

    expect(ui.table).toHaveBeenCalled();
    const tableArg: any = (ui.table as any).mock.calls[0][0];
    expect(tableArg.rows[0][1]).toContain('wait');
    expect(tableArg.rows[0][3]).toBe('just now');
    expect(ui.warning).toHaveBeenCalledWith('1 agent(s) waiting for input.');
  });

  it('shows available agents when open target is not found', async () => {
    mockManager.listAgents.mockResolvedValue([
      { name: 'repo-a', status: AgentStatus.RUNNING, summary: 'A', lastActive: new Date(), pid: 1 },
      { name: 'repo-b', status: AgentStatus.WAITING, summary: 'B', lastActive: new Date(), pid: 2 },
    ]);
    mockManager.resolveAgent.mockReturnValue(null);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'open', 'missing']);

    expect(ui.error).toHaveBeenCalledWith('No agent found matching "missing".');
    expect(ui.info).toHaveBeenCalledWith('Available agents:');
    expect(logSpy).toHaveBeenCalledWith('  - repo-a');
    expect(logSpy).toHaveBeenCalledWith('  - repo-b');
  });

  it('focuses selected agent when open succeeds', async () => {
    const agent = {
      name: 'repo-a',
      status: AgentStatus.RUNNING,
      summary: 'A',
      lastActive: new Date(),
      pid: 10,
    };
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockFocusManager.findTerminal.mockResolvedValue({ type: 'tmux', identifier: '1:1' });
    mockFocusManager.focusTerminal.mockResolvedValue(true);
    mockPrompt.mockResolvedValue({ selectedAgent: agent });

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'open', 'repo-a']);

    expect(TerminalFocusManager).toHaveBeenCalled();
    expect(mockSpinner.start).toHaveBeenCalled();
    expect(mockFocusManager.findTerminal).toHaveBeenCalledWith(10);
    expect(mockFocusManager.focusTerminal).toHaveBeenCalled();
    expect(mockSpinner.succeed).toHaveBeenCalledWith('Focused repo-a!');
  });
});
