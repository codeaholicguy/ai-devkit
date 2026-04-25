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

const mockTtyWriterSend = jest.fn<(location: any, message: string) => Promise<void>>().mockResolvedValue(undefined);

jest.mock('@ai-devkit/agent-manager', () => ({
  AgentManager: jest.fn(() => mockManager),
  ClaudeCodeAdapter: jest.fn(),
  CodexAdapter: jest.fn(),
  GeminiCliAdapter: jest.fn(),
  TerminalFocusManager: jest.fn(() => mockFocusManager),
  TtyWriter: { send: (location: any, message: string) => mockTtyWriterSend(location, message) },
  AgentStatus: {
    RUNNING: 'running',
    WAITING: 'waiting',
    IDLE: 'idle',
    UNKNOWN: 'unknown',
  },
}), { virtual: true });

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
    success: jest.fn(),
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
    jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  it('outputs JSON for list --json', async () => {
    const now = new Date('2026-02-26T10:00:00.000Z');
    const agents = [
      {
        name: 'repo-a',
        type: 'claude',
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
        type: 'claude',
        status: AgentStatus.WAITING,
        summary: 'Need input',
        lastActive: new Date('2026-02-26T10:00:00.000Z'),
        pid: 100,
      },
      {
        name: 'repo-b',
        type: 'codex',
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
    expect(tableArg.headers).toEqual(['Agent', 'CWD', 'Type', 'Status', 'Working On', 'Active']);
    expect(tableArg.rows[0][2]).toBe('Claude Code');
    expect(tableArg.rows[1][2]).toBe('Codex');
    expect(tableArg.rows[0][3]).toContain('wait');
    expect(tableArg.rows[0][5]).toBe('just now');
    expect(ui.warning).toHaveBeenCalledWith('1 agent(s) waiting for input.');
  });

  it('formats all agent types with human-friendly labels', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-02-26T10:00:00.000Z').getTime());
    mockManager.listAgents.mockResolvedValue([
      { name: 'a', type: 'claude', status: AgentStatus.RUNNING, summary: '', lastActive: new Date('2026-02-26T10:00:00.000Z'), pid: 1 },
      { name: 'b', type: 'codex', status: AgentStatus.RUNNING, summary: '', lastActive: new Date('2026-02-26T10:00:00.000Z'), pid: 2 },
      { name: 'c', type: 'gemini_cli', status: AgentStatus.RUNNING, summary: '', lastActive: new Date('2026-02-26T10:00:00.000Z'), pid: 3 },
      { name: 'd', type: 'other', status: AgentStatus.RUNNING, summary: '', lastActive: new Date('2026-02-26T10:00:00.000Z'), pid: 4 },
    ]);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'list']);

    const tableArg: any = (ui.table as any).mock.calls[0][0];
    expect(tableArg.rows[0][2]).toBe('Claude Code');
    expect(tableArg.rows[1][2]).toBe('Codex');
    expect(tableArg.rows[2][2]).toBe('Gemini CLI');
    expect(tableArg.rows[3][2]).toBe('Other');
  });

  it('truncates working-on text to first line', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-02-26T10:00:00.000Z').getTime());
    mockManager.listAgents.mockResolvedValue([
      {
        name: 'repo-a',
        type: 'claude',
        status: AgentStatus.RUNNING,
        summary: `Investigating parser bug
Waiting on user input`,
        lastActive: new Date('2026-02-26T09:58:00.000Z'),
        pid: 100,
      },
    ]);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'list']);

    const tableArg: any = (ui.table as any).mock.calls[0][0];
    expect(tableArg.rows[0][4]).toBe('Investigating parser bug');
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
    expect(ui.text).toHaveBeenCalledWith('  - repo-a');
    expect(ui.text).toHaveBeenCalledWith('  - repo-b');
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

  it('sends message to a resolved agent', async () => {
    const agent = {
      name: 'repo-a',
      status: AgentStatus.WAITING,
      summary: 'Waiting',
      lastActive: new Date(),
      pid: 10,
    };
    const location = { type: 'tmux', identifier: '0:1.0', tty: '/dev/ttys030' };
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockFocusManager.findTerminal.mockResolvedValue(location);
    mockTtyWriterSend.mockResolvedValue(undefined);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'continue', '--id', 'repo-a']);

    expect(mockManager.resolveAgent).toHaveBeenCalledWith('repo-a', [agent]);
    expect(mockFocusManager.findTerminal).toHaveBeenCalledWith(10);
    expect(mockTtyWriterSend).toHaveBeenCalledWith(location, 'continue');
    expect(ui.success).toHaveBeenCalledWith('Sent message to repo-a.');
  });

  it('shows error when send target agent is not found', async () => {
    mockManager.listAgents.mockResolvedValue([
      { name: 'repo-a', status: AgentStatus.RUNNING, summary: 'A', lastActive: new Date(), pid: 1 },
    ]);
    mockManager.resolveAgent.mockReturnValue(null);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'hello', '--id', 'missing']);

    expect(ui.error).toHaveBeenCalledWith('No agent found matching "missing".');
  });

  it('shows error when send matches multiple agents', async () => {
    const agents = [
      { name: 'repo-a', status: AgentStatus.WAITING, summary: 'A', lastActive: new Date(), pid: 1 },
      { name: 'repo-ab', status: AgentStatus.RUNNING, summary: 'B', lastActive: new Date(), pid: 2 },
    ];
    mockManager.listAgents.mockResolvedValue(agents);
    mockManager.resolveAgent.mockReturnValue(agents);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'hello', '--id', 'repo']);

    expect(ui.error).toHaveBeenCalledWith('Multiple agents match "repo":');
    expect(ui.info).toHaveBeenCalledWith('Please use a more specific identifier.');
  });

  it('warns when agent is not waiting but still sends', async () => {
    const agent = {
      name: 'repo-a',
      status: AgentStatus.RUNNING,
      summary: 'Running',
      lastActive: new Date(),
      pid: 10,
    };
    const location = { type: 'tmux', identifier: '0:1.0', tty: '/dev/ttys030' };
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockFocusManager.findTerminal.mockResolvedValue(location);
    mockTtyWriterSend.mockResolvedValue(undefined);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'continue', '--id', 'repo-a']);

    expect(ui.warning).toHaveBeenCalledWith(
      'Agent "repo-a" is not waiting for input (status: running). Sending anyway.'
    );
    expect(mockTtyWriterSend).toHaveBeenCalled();
    expect(ui.success).toHaveBeenCalledWith('Sent message to repo-a.');
  });

  it('shows error when terminal cannot be found', async () => {
    const agent = {
      name: 'repo-a',
      status: AgentStatus.WAITING,
      summary: 'Waiting',
      lastActive: new Date(),
      pid: 10,
    };
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockFocusManager.findTerminal.mockResolvedValue(null);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'hello', '--id', 'repo-a']);

    expect(ui.error).toHaveBeenCalledWith('Cannot find terminal for agent "repo-a" (PID: 10).');
    expect(mockTtyWriterSend).not.toHaveBeenCalled();
  });
});
