import type { Mock } from 'vitest';
import { Command } from 'commander';

import { AgentManager, AgentStatus, TerminalFocusManager } from '@ai-devkit/agent-manager';
import { registerAgentCommand } from '../../commands/agent.js';
import { ui } from '../../util/terminal-ui.js';

const mockManager: any = {
  registerAdapter: vi.fn(),
  listAgents: vi.fn(),
  listSessions: vi.fn(),
  resolveAgent: vi.fn(),
  getAdapter: vi.fn(),
};

const mockAgentAdapter: any = {
  getConversation: vi.fn(),
};

const mockFocusManager: any = {
  findTerminal: vi.fn(),
  focusTerminal: vi.fn(),
};

const mockSpinner: any = {
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
};

const mockSelect: any = vi.fn();

const mockTtyWriterSend = vi.fn<(location: any, message: string) => Promise<void>>().mockResolvedValue(undefined);
const mockKillAgent = vi.fn<(...args: any[]) => Promise<any>>();
const { mockEnableDebug, mockDebugLogger } = vi.hoisted(() => ({
  mockEnableDebug: vi.fn(),
  mockDebugLogger: vi.fn(),
}));
let restoreStdin: (() => void) | undefined;

const mockGroupStore: any = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  addMember: vi.fn(),
  removeMember: vi.fn(),
  remove: vi.fn(),
};

const mockRegistry: any = {
  prune: vi.fn(),
  lookup: vi.fn().mockReturnValue(null),
  list: vi.fn().mockReturnValue([]),
  register: vi.fn(),
  isAlive: vi.fn().mockReturnValue(false),
  rename: vi.fn(),
};

const { RenameNotFoundError, RenameConflictError } = vi.hoisted(() => {
  class RenameNotFoundError extends Error {
    agentName: string;
    constructor(agentName: string) {
      super(`Agent "${agentName}" not found in registry.`);
      this.name = 'RenameNotFoundError';
      this.agentName = agentName;
    }
  }
  class RenameConflictError extends Error {
    agentName: string;
    constructor(agentName: string) {
      super(`Agent "${agentName}" is already in use.`);
      this.name = 'RenameConflictError';
      this.agentName = agentName;
    }
  }
  return { RenameNotFoundError, RenameConflictError };
});

vi.mock('@ai-devkit/agent-manager', () => ({
  AgentManager: vi.fn(function () { return mockManager; }),
  ClaudeCodeAdapter: vi.fn(),
  CodexAdapter: vi.fn(),
  CopilotAdapter: vi.fn(),
  GeminiCliAdapter: vi.fn(),
  GrokCliAdapter: vi.fn(),
  OpenCodeAdapter: vi.fn(),
  PiAdapter: vi.fn(),
  TerminalFocusManager: vi.fn(function () { return mockFocusManager; }),
  TtyWriter: { send: (location: any, message: string) => mockTtyWriterSend(location, message) },
  AgentStatus: {
    RUNNING: 'running',
    WAITING: 'waiting',
    IDLE: 'idle',
    UNKNOWN: 'unknown',
  },
  AgentRegistry: {
    default: vi.fn(function () { return mockRegistry; }),
  },
  TmuxManager: vi.fn(function () { return {
    isAvailable: vi.fn().mockResolvedValue(true),
    sessionExists: vi.fn().mockResolvedValue(false),
    createSession: vi.fn().mockResolvedValue(undefined),
    sendKeys: vi.fn().mockResolvedValue(undefined),
    findAgentPid: vi.fn().mockResolvedValue(12345),
    killSession: vi.fn().mockResolvedValue(undefined),
  }; }),
  AGENTS: {
    claude:     { command: 'claude',   matches: () => true },
    codex:      { command: 'codex',    matches: () => true },
    copilot:    { command: 'copilot',  matches: () => true },
    gemini_cli: { command: 'gemini',   matches: () => true },
    grok_cli:   { command: 'grok',     matches: () => true },
    opencode:   { command: 'opencode', matches: () => true },
    pi:         { command: 'pi',       matches: () => true },
  },
  RenameNotFoundError: RenameNotFoundError,
  RenameConflictError: RenameConflictError,
}), { virtual: true });

vi.mock('@inquirer/prompts', () => ({
  select: (...args: unknown[]) => mockSelect(...args),
}));

vi.mock('../../util/terminal-ui.js', () => ({
  ui: {
    text: vi.fn(),
    table: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    breakline: vi.fn(),
    spinner: vi.fn(() => mockSpinner),
  },
}));

vi.mock('../../util/debug.js', () => ({
  enableDebug: () => mockEnableDebug(),
  createLogger: () => mockDebugLogger,
}));

vi.mock('../../services/agent/agent.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/agent/agent.service.js')>();
  return {
    ...actual,
    killAgent: (...args: any[]) => mockKillAgent(...args),
  };
});

vi.mock('../../tui/console/ConsoleApp.js', () => ({
  ConsoleApp: () => null,
}));

vi.mock('../../services/agent/agent-group.service.js', () => {
  class AgentGroupNotFoundError extends Error {
    constructor(public groupName: string) {
      super(`Agent group "${groupName}" not found.`);
      this.name = 'AgentGroupNotFoundError';
    }
  }
  class AgentGroupConflictError extends Error {
    constructor(public groupName: string) {
      super(`Agent group "${groupName}" already exists.`);
      this.name = 'AgentGroupConflictError';
    }
  }
  class AgentGroupInvalidNameError extends Error {
    constructor(public groupName: string) {
      super(`Invalid agent group name "${groupName}".`);
      this.name = 'AgentGroupInvalidNameError';
    }
  }
  class AgentGroupInvalidMemberError extends Error {
    constructor(public member: string) {
      super(`Invalid agent group member "${member}".`);
      this.name = 'AgentGroupInvalidMemberError';
    }
  }
  class AgentGroupEmptyMembersError extends Error {
    constructor() {
      super('Agent group must contain at least one member.');
      this.name = 'AgentGroupEmptyMembersError';
    }
  }
  class AgentGroupStorageError extends Error {
    constructor(public filePath: string, message: string) {
      super(`Failed to read agent groups from "${filePath}": ${message}`);
      this.name = 'AgentGroupStorageError';
    }
  }

  return {
    createDefaultAgentGroupService: vi.fn(() => mockGroupStore),
    AgentGroupNotFoundError,
    AgentGroupConflictError,
    AgentGroupInvalidNameError,
    AgentGroupInvalidMemberError,
    AgentGroupEmptyMembersError,
    AgentGroupStorageError,
  };
});

describe('agent command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    restoreStdin?.();
    restoreStdin = undefined;
    vi.clearAllMocks();
    mockManager.registerAdapter.mockReset();
    mockManager.listAgents.mockReset();
    mockManager.listSessions.mockReset();
    mockManager.resolveAgent.mockReset();
    mockManager.getAdapter.mockReset();
    mockAgentAdapter.getConversation.mockReset();
    mockFocusManager.findTerminal.mockReset();
    mockFocusManager.focusTerminal.mockReset();
    mockTtyWriterSend.mockReset().mockResolvedValue(undefined);
    mockKillAgent.mockReset();
    Object.values(mockGroupStore).forEach((method) => method.mockReset());
    mockGroupStore.list.mockReturnValue([]);
    process.exitCode = undefined;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  function mockReadableStdin(input: string): void {
    const originalIsTTY = process.stdin.isTTY;
    const setEncodingSpy = vi.spyOn(process.stdin, 'setEncoding').mockReturnValue(process.stdin);

    Object.defineProperty(process.stdin, 'isTTY', {
      configurable: true,
      value: false,
    });

    process.nextTick(() => {
      process.stdin.emit('data', input);
      process.stdin.emit('end');
    });

    restoreStdin = () => {
      setEncodingSpy.mockRestore();
      Object.defineProperty(process.stdin, 'isTTY', {
        configurable: true,
        value: originalIsTTY,
      });
    };
  }

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
    expect(mockManager.registerAdapter).toHaveBeenCalledTimes(7);
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(agents, null, 2));
  });

  it('enables debug logging when starting an agent with --debug', async () => {
    const program = new Command();
    registerAgentCommand(program);

    await program.parseAsync(['node', 'test', 'agent', 'start', '--type', 'claude', '--name', 'agent1', '--debug']);

    expect(mockEnableDebug).toHaveBeenCalledTimes(1);
    expect(ui.success).toHaveBeenCalledWith('Agent "agent1" started (claude, PID 12345)');
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
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-02-26T10:00:00.000Z').getTime());
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
    expect(tableArg.headers).toEqual(['Agent', 'Project', 'Type', 'Status', 'Working On', 'Active']);
    expect(tableArg.rows[0][2]).toBe('Claude Code');
    expect(tableArg.rows[1][2]).toBe('Codex');
    expect(tableArg.rows[0][3]).toContain('wait');
    expect(tableArg.rows[0][5]).toBe('just now');
    expect(ui.warning).toHaveBeenCalledWith('1 agent(s) waiting for input.');
  });

  it('formats all agent types with human-friendly labels', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-02-26T10:00:00.000Z').getTime());
    mockManager.listAgents.mockResolvedValue([
      { name: 'a', type: 'claude', status: AgentStatus.RUNNING, summary: '', lastActive: new Date('2026-02-26T10:00:00.000Z'), pid: 1 },
      { name: 'b', type: 'codex', status: AgentStatus.RUNNING, summary: '', lastActive: new Date('2026-02-26T10:00:00.000Z'), pid: 2 },
      { name: 'c', type: 'gemini_cli', status: AgentStatus.RUNNING, summary: '', lastActive: new Date('2026-02-26T10:00:00.000Z'), pid: 3 },
      { name: 'd', type: 'pi', status: AgentStatus.RUNNING, summary: '', lastActive: new Date('2026-02-26T10:00:00.000Z'), pid: 4 },
      { name: 'e', type: 'other', status: AgentStatus.RUNNING, summary: '', lastActive: new Date('2026-02-26T10:00:00.000Z'), pid: 5 },
    ]);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'list']);

    const tableArg: any = (ui.table as any).mock.calls[0][0];
    expect(tableArg.rows[0][2]).toBe('Claude Code');
    expect(tableArg.rows[1][2]).toBe('Codex');
    expect(tableArg.rows[2][2]).toBe('Gemini CLI');
    expect(tableArg.rows[3][2]).toBe('Pi');
    expect(tableArg.rows[4][2]).toBe('Other');
  });

  it('truncates working-on text to first line', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-02-26T10:00:00.000Z').getTime());
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
      status: AgentStatus.WAITING,
      summary: 'A',
      lastActive: new Date(),
      pid: 10,
    };
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockFocusManager.findTerminal.mockResolvedValue({ type: 'tmux', identifier: '1:1' });
    mockFocusManager.focusTerminal.mockResolvedValue(true);
    mockSelect.mockResolvedValue(agent);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'open', 'repo-a']);

    expect(TerminalFocusManager).toHaveBeenCalled();
    expect(mockSpinner.start).toHaveBeenCalled();
    expect(mockFocusManager.findTerminal).toHaveBeenCalledWith(10);
    expect(mockFocusManager.focusTerminal).toHaveBeenCalled();
    expect(mockSpinner.succeed).toHaveBeenCalledWith('Focused repo-a!');
  });

  it('enables debug logging and wires a terminal trace when opening with --debug', async () => {
    const agent = {
      name: 'repo-a',
      status: AgentStatus.WAITING,
      summary: 'A',
      lastActive: new Date(),
      pid: 10,
    };
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockFocusManager.findTerminal.mockResolvedValue({ type: 'wezterm', identifier: '7' });
    mockFocusManager.focusTerminal.mockResolvedValue(true);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'open', 'repo-a', '--debug']);

    expect(mockEnableDebug).toHaveBeenCalledTimes(1);
    // A debug logger callback is passed into TerminalFocusManager so its
    // matching/focus decision path can be inspected.
    expect(TerminalFocusManager).toHaveBeenCalledWith(expect.any(Function));
    expect(mockFocusManager.findTerminal).toHaveBeenCalledWith(10);
    expect(mockSpinner.succeed).toHaveBeenCalledWith('Focused repo-a!');
  });

  it('kills a resolved agent and reports tmux cleanup', async () => {
    const agent = {
      name: 'repo-a',
      type: 'claude',
      status: AgentStatus.RUNNING,
      summary: 'A',
      lastActive: new Date(),
      pid: 10,
    };
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockKillAgent.mockResolvedValue({
      agentName: 'repo-a',
      pid: 10,
      tmuxSession: 'repo-a',
    });

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'kill', 'repo-a']);

    expect(mockManager.resolveAgent).toHaveBeenCalledWith('repo-a', [agent]);
    expect(mockKillAgent).toHaveBeenCalledWith(agent, expect.objectContaining({
      tmux: expect.any(Object),
      registry: mockRegistry,
    }));
    expect(ui.success).toHaveBeenCalledWith('Stopped agent "repo-a" (PID 10) and tmux session "repo-a".');
  });

  it('does not kill when target is ambiguous', async () => {
    const agents = [
      { name: 'repo-a', status: AgentStatus.RUNNING, summary: 'A', lastActive: new Date(), pid: 10 },
      { name: 'repo-b', status: AgentStatus.WAITING, summary: 'B', lastActive: new Date(), pid: 11 },
    ];
    mockManager.listAgents.mockResolvedValue(agents);
    mockManager.resolveAgent.mockReturnValue(agents);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'kill', 'repo']);

    expect(ui.error).toHaveBeenCalledWith('Multiple agents match "repo":');
    expect(mockKillAgent).not.toHaveBeenCalled();
  });

  it('does not kill when target is not found', async () => {
    const agents = [
      { name: 'repo-a', status: AgentStatus.RUNNING, summary: 'A', lastActive: new Date(), pid: 10 },
    ];
    mockManager.listAgents.mockResolvedValue(agents);
    mockManager.resolveAgent.mockReturnValue(null);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'kill', 'missing']);

    expect(ui.error).toHaveBeenCalledWith('No agent found matching "missing".');
    expect(ui.info).toHaveBeenCalledWith('Available agents:');
    expect(mockKillAgent).not.toHaveBeenCalled();
  });

  it('creates an agent group with multiple members', async () => {
    mockGroupStore.create.mockReturnValue({
      name: 'backend-team',
      members: ['api', 'worker'],
    });

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'group', 'create', 'backend-team', '--agent', 'api', '--agent', 'worker']);

    expect(mockGroupStore.create).toHaveBeenCalledWith('backend-team', ['api', 'worker']);
    expect(ui.success).toHaveBeenCalledWith('Created agent group "backend-team" with 2 member(s).');
  });

  it('updates an agent group by replacing members', async () => {
    mockGroupStore.update.mockReturnValue({
      name: 'backend-team',
      members: ['api-v2', 'worker-v2'],
    });

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'group', 'update', 'backend-team', '--agent', 'api-v2', '--agent', 'worker-v2']);

    expect(mockGroupStore.update).toHaveBeenCalledWith('backend-team', ['api-v2', 'worker-v2']);
    expect(ui.success).toHaveBeenCalledWith('Updated agent group "backend-team" with 2 member(s).');
  });

  it('adds a member to an agent group', async () => {
    mockGroupStore.addMember.mockReturnValue({
      name: 'backend-team',
      members: ['api', 'docs'],
    });

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'group', 'add', 'backend-team', 'docs']);

    expect(mockGroupStore.addMember).toHaveBeenCalledWith('backend-team', 'docs');
    expect(ui.success).toHaveBeenCalledWith('Agent group "backend-team" now has 2 member(s).');
  });

  it('removes a member from an agent group', async () => {
    mockGroupStore.removeMember.mockReturnValue({
      name: 'backend-team',
      members: ['worker'],
    });

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'group', 'remove-agent', 'backend-team', 'api']);

    expect(mockGroupStore.removeMember).toHaveBeenCalledWith('backend-team', 'api');
    expect(ui.success).toHaveBeenCalledWith('Agent group "backend-team" now has 1 member(s).');
  });

  it('removes an agent group', async () => {
    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'group', 'remove', 'backend-team']);

    expect(mockGroupStore.remove).toHaveBeenCalledWith('backend-team');
    expect(ui.success).toHaveBeenCalledWith('Removed agent group "backend-team".');
  });

  it('lists configured agent groups', async () => {
    mockGroupStore.list.mockReturnValue([
      { name: 'backend-team', members: ['api', 'worker'] },
      { name: 'docs-team', members: ['docs'] },
    ]);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'group', 'list']);

    expect(ui.table).toHaveBeenCalledWith(expect.objectContaining({
      headers: ['Group', 'Members'],
      rows: [
        ['backend-team', 'api, worker'],
        ['docs-team', 'docs'],
      ],
    }));
  });

  it('shows agent group detail', async () => {
    mockGroupStore.get.mockReturnValue({
      name: 'backend-team',
      members: ['api', 'worker'],
    });

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'group', 'detail', 'backend-team']);

    expect(mockGroupStore.get).toHaveBeenCalledWith('backend-team');
    expect(ui.text).toHaveBeenCalledWith('Agent Group: backend-team', { breakline: true });
    expect(ui.text).toHaveBeenCalledWith('  - api');
    expect(ui.text).toHaveBeenCalledWith('  - worker');
  });

  it('reports invalid group names for detail', async () => {
    mockGroupStore.get.mockImplementation(() => {
      throw new Error('Invalid agent group name "Bad_Name".');
    });

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'group', 'detail', 'Bad_Name']);

    expect(ui.error).toHaveBeenCalledWith('Failed to manage agent group: Invalid agent group name "Bad_Name".');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('prints a user-readable group error and exits non-zero', async () => {
    mockGroupStore.remove.mockImplementation(() => {
      throw new Error('Agent group "missing" not found.');
    });

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'group', 'remove', 'missing']);

    expect(ui.error).toHaveBeenCalledWith('Failed to manage agent group: Agent group "missing" not found.');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('sends message to a resolved agent', async () => {
    const agent = {
      name: 'repo-a',
      status: AgentStatus.RUNNING,
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

  it('reads a multi-line message from stdin when --stdin is set', async () => {
    const agent = {
      name: 'repo-a',
      status: AgentStatus.WAITING,
      summary: 'Waiting',
      lastActive: new Date(),
      pid: 10,
    };
    const location = { type: 'tmux', identifier: '0:1.0', tty: '/dev/ttys030' };
    mockReadableStdin('line 1\nline 2\n');
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockFocusManager.findTerminal.mockResolvedValue(location);
    mockTtyWriterSend.mockResolvedValue(undefined);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', '--id', 'repo-a', '--stdin']);

    expect(mockTtyWriterSend).toHaveBeenCalledWith(location, 'line 1\nline 2\n');
    expect(ui.success).toHaveBeenCalledWith('Sent message to repo-a.');
  });

  it('reads from piped stdin when no message argument is provided', async () => {
    const agent = {
      name: 'repo-a',
      status: AgentStatus.WAITING,
      summary: 'Waiting',
      lastActive: new Date(),
      pid: 10,
    };
    const location = { type: 'tmux', identifier: '0:1.0', tty: '/dev/ttys030' };
    mockReadableStdin('npm test output\nfailed assertion\n');
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockFocusManager.findTerminal.mockResolvedValue(location);
    mockTtyWriterSend.mockResolvedValue(undefined);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', '--id', 'repo-a']);

    expect(mockTtyWriterSend).toHaveBeenCalledWith(location, 'npm test output\nfailed assertion\n');
    expect(ui.success).toHaveBeenCalledWith('Sent message to repo-a.');
  });

  it('fails when both a message argument and --stdin are provided', async () => {
    mockReadableStdin('stdin text\n');

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'hello', '--id', 'repo-a', '--stdin']);

    expect(ui.error).toHaveBeenCalledWith('Failed to send message: Use either a message argument or --stdin, not both.');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockTtyWriterSend).not.toHaveBeenCalled();
  });

  it('fails before sending when no send target selector is provided', async () => {
    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'hello']);

    expect(ui.error).toHaveBeenCalledWith('Failed to send message: Use exactly one of --id or --group.');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockManager.listAgents).not.toHaveBeenCalled();
    expect(mockTtyWriterSend).not.toHaveBeenCalled();
  });

  it('fails before sending when both --id and --group are provided', async () => {
    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'hello', '--id', 'repo-a', '--group', 'backend-team']);

    expect(ui.error).toHaveBeenCalledWith('Failed to send message: Use exactly one of --id or --group.');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockManager.listAgents).not.toHaveBeenCalled();
    expect(mockTtyWriterSend).not.toHaveBeenCalled();
  });

  it('rejects --wait with --group before sending', async () => {
    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'hello', '--group', 'backend-team', '--wait']);

    expect(ui.error).toHaveBeenCalledWith('Failed to send message: Use --wait only with --id; group wait mode is not supported.');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockTtyWriterSend).not.toHaveBeenCalled();
  });

  it('rejects --json with --group before sending', async () => {
    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'hello', '--group', 'backend-team', '--json']);

    expect(ui.error).toHaveBeenCalledWith('Failed to send message: Use --json only with --id --wait; group JSON output is not supported.');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockTtyWriterSend).not.toHaveBeenCalled();
  });

  it('reports invalid group names for send --group before delivery', async () => {
    mockGroupStore.get.mockImplementation(() => {
      throw new Error('Invalid agent group name "Bad_Name".');
    });

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'hello', '--group', 'Bad_Name']);

    expect(ui.error).toHaveBeenCalledWith('Failed to send message: Invalid agent group name "Bad_Name".');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockManager.listAgents).not.toHaveBeenCalled();
    expect(mockTtyWriterSend).not.toHaveBeenCalled();
  });

  it('sends a message to every distinct resolved group target', async () => {
    const api = { name: 'api', status: AgentStatus.WAITING, summary: 'Waiting', lastActive: new Date(), pid: 10 };
    const worker = { name: 'worker', status: AgentStatus.IDLE, summary: 'Idle', lastActive: new Date(), pid: 11 };
    const duplicateApi = { ...api };
    const apiLocation = { type: 'tmux', identifier: '0:1.0', tty: '/dev/ttys030' };
    const workerLocation = { type: 'tmux', identifier: '0:1.1', tty: '/dev/ttys031' };
    const agents = [api, worker];
    mockGroupStore.get.mockReturnValue({ name: 'backend-team', members: ['api', 'worker', 'api-alias'] });
    mockManager.listAgents.mockResolvedValue(agents);
    mockManager.resolveAgent
      .mockReturnValueOnce(api)
      .mockReturnValueOnce(worker)
      .mockReturnValueOnce(duplicateApi);
    mockFocusManager.findTerminal
      .mockResolvedValueOnce(apiLocation)
      .mockResolvedValueOnce(workerLocation);
    mockTtyWriterSend.mockResolvedValue(undefined);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'status update', '--group', 'backend-team']);

    expect(mockManager.resolveAgent).toHaveBeenNthCalledWith(1, 'api', agents);
    expect(mockManager.resolveAgent).toHaveBeenNthCalledWith(2, 'worker', agents);
    expect(mockManager.resolveAgent).toHaveBeenNthCalledWith(3, 'api-alias', agents);
    expect(mockFocusManager.findTerminal).toHaveBeenCalledTimes(2);
    expect(mockTtyWriterSend).toHaveBeenNthCalledWith(1, apiLocation, 'status update');
    expect(mockTtyWriterSend).toHaveBeenNthCalledWith(2, workerLocation, 'status update');
    expect(ui.info).toHaveBeenCalledWith('Skipped duplicate target "api" from group member "api-alias".');
    expect(ui.success).toHaveBeenCalledWith('Sent message to 2 agent(s) in group "backend-team".');
  });

  it('fails before delivery when any group member is missing or ambiguous', async () => {
    const agents = [
      { name: 'api', status: AgentStatus.WAITING, summary: 'Waiting', lastActive: new Date(), pid: 10 },
      { name: 'worker-a', status: AgentStatus.WAITING, summary: 'Waiting', lastActive: new Date(), pid: 11 },
      { name: 'worker-b', status: AgentStatus.WAITING, summary: 'Waiting', lastActive: new Date(), pid: 12 },
    ];
    mockGroupStore.get.mockReturnValue({ name: 'backend-team', members: ['api', 'missing', 'worker'] });
    mockManager.listAgents.mockResolvedValue(agents);
    mockManager.resolveAgent
      .mockReturnValueOnce(agents[0])
      .mockReturnValueOnce(null)
      .mockReturnValueOnce([agents[1], agents[2]]);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'hello', '--group', 'backend-team']);

    expect(ui.error).toHaveBeenCalledWith('Cannot send to group "backend-team" because some members could not be resolved.');
    expect(ui.error).toHaveBeenCalledWith('  - missing: no running agent matched');
    expect(ui.error).toHaveBeenCalledWith('  - worker: matched multiple agents (worker-a, worker-b)');
    expect(mockFocusManager.findTerminal).not.toHaveBeenCalled();
    expect(mockTtyWriterSend).not.toHaveBeenCalled();
  });

  it('continues group delivery after one target fails and exits non-zero', async () => {
    const api = { name: 'api', status: AgentStatus.RUNNING, summary: 'Running', lastActive: new Date(), pid: 10 };
    const worker = { name: 'worker', status: AgentStatus.WAITING, summary: 'Waiting', lastActive: new Date(), pid: 11 };
    const apiLocation = { type: 'tmux', identifier: '0:1.0', tty: '/dev/ttys030' };
    const workerLocation = { type: 'tmux', identifier: '0:1.1', tty: '/dev/ttys031' };
    mockGroupStore.get.mockReturnValue({ name: 'backend-team', members: ['api', 'worker'] });
    mockManager.listAgents.mockResolvedValue([api, worker]);
    mockManager.resolveAgent
      .mockReturnValueOnce(api)
      .mockReturnValueOnce(worker);
    mockFocusManager.findTerminal
      .mockResolvedValueOnce(apiLocation)
      .mockResolvedValueOnce(workerLocation);
    mockTtyWriterSend
      .mockRejectedValueOnce(new Error('send failed'))
      .mockResolvedValueOnce(undefined);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'hello', '--group', 'backend-team']);

    expect(ui.warning).toHaveBeenCalledWith('Agent "api" is not waiting for input (status: running). Sending anyway.');
    expect(mockTtyWriterSend).toHaveBeenCalledTimes(2);
    expect(ui.error).toHaveBeenCalledWith('Failed to send to api: send failed');
    expect(ui.success).toHaveBeenCalledWith('Sent message to worker.');
    expect(ui.error).toHaveBeenCalledWith('Sent message to 1 agent(s), failed for 1 agent(s) in group "backend-team".');
    expect(process.exitCode).toBe(1);
  });

  it('sends message with --wait, seeds transcript before delivery, and prints assistant output only to stdout', async () => {
    const agent = {
      name: 'repo-a',
      type: 'claude',
      status: AgentStatus.WAITING,
      summary: 'Waiting',
      lastActive: new Date(),
      pid: 10,
      sessionId: 'session-1',
      sessionFilePath: '/tmp/session.jsonl',
    };
    const location = { type: 'tmux', identifier: '0:1.0', tty: '/dev/ttys030' };
    const historical = [{ role: 'assistant', content: 'old response' }];
    const withNewResponse = [...historical, { role: 'assistant', content: 'new response' }];
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockManager.getAdapter.mockReturnValue(mockAgentAdapter);
    mockAgentAdapter.getConversation
      .mockReturnValueOnce(historical)
      .mockReturnValueOnce(withNewResponse);
    mockFocusManager.findTerminal.mockResolvedValue(location);
    mockTtyWriterSend.mockResolvedValue(undefined);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'continue', '--id', 'repo-a', '--wait']);

    expect(mockManager.getAdapter).toHaveBeenCalledWith('claude');
    expect(mockAgentAdapter.getConversation).toHaveBeenCalledWith('/tmp/session.jsonl', { verbose: false });
    expect(mockAgentAdapter.getConversation.mock.invocationCallOrder[0])
      .toBeLessThan(mockTtyWriterSend.mock.invocationCallOrder[0]);
    expect(stdoutSpy).toHaveBeenCalledWith('new response\n');
    expect(ui.success).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('uses the provided timeout duration for send --wait', async () => {
    const agent = {
      name: 'repo-a',
      type: 'claude',
      status: AgentStatus.WAITING,
      summary: 'Waiting',
      lastActive: new Date(),
      pid: 10,
      sessionId: 'session-1',
      sessionFilePath: '/tmp/session.jsonl',
    };
    const location = { type: 'tmux', identifier: '0:1.0', tty: '/dev/ttys030' };
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockManager.getAdapter.mockReturnValue(mockAgentAdapter);
    mockAgentAdapter.getConversation.mockReturnValue([]);
    mockFocusManager.findTerminal.mockResolvedValue(location);
    mockTtyWriterSend.mockResolvedValue(undefined);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'continue', '--id', 'repo-a', '--wait', '--timeout', '1500']);

    expect(mockTtyWriterSend).toHaveBeenCalledWith(location, 'continue');
    expect(ui.error).not.toHaveBeenCalled();
  });

  it('fails before sending when --timeout is used without --wait', async () => {
    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'continue', '--id', 'repo-a', '--timeout', '30000']);

    expect(ui.error).toHaveBeenCalledWith('Failed to send message: Use --timeout only with --wait.');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockManager.listAgents).not.toHaveBeenCalled();
    expect(mockTtyWriterSend).not.toHaveBeenCalled();
  });

  it('fails before sending when --timeout is invalid', async () => {
    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'continue', '--id', 'repo-a', '--wait', '--timeout', '1.5s']);

    expect(ui.error).toHaveBeenCalledWith('Failed to send message: Invalid --timeout. Expected positive integer milliseconds. Example: 30000.');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockManager.listAgents).not.toHaveBeenCalled();
    expect(mockTtyWriterSend).not.toHaveBeenCalled();
  });

  it('validates invalid --timeout before resolving the message source', async () => {
    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', '--id', 'repo-a', '--wait', '--timeout', '1.5s']);

    expect(ui.error).toHaveBeenCalledWith('Failed to send message: Invalid --timeout. Expected positive integer milliseconds. Example: 30000.');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockManager.listAgents).not.toHaveBeenCalled();
    expect(mockTtyWriterSend).not.toHaveBeenCalled();
  });

  it('outputs structured JSON for send --wait --json without streaming assistant messages', async () => {
    const lastActive = new Date('2026-05-14T00:00:00.000Z');
    const agent = {
      name: 'repo-a',
      type: 'claude',
      status: AgentStatus.WAITING,
      summary: 'Waiting',
      projectPath: '/repo',
      lastActive,
      pid: 10,
      sessionId: 'session-1',
      sessionFilePath: '/tmp/session.jsonl',
    };
    const location = { type: 'tmux', identifier: '0:1.0', tty: '/dev/ttys030' };
    const messages = [
      { role: 'assistant', content: 'first response', timestamp: '2026-05-14T00:00:01.000Z' },
      { role: 'assistant', content: 'second response', timestamp: '2026-05-14T00:00:02.000Z' },
    ];
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockManager.getAdapter.mockReturnValue(mockAgentAdapter);
    mockAgentAdapter.getConversation
      .mockReturnValueOnce([])
      .mockReturnValueOnce(messages);
    mockFocusManager.findTerminal.mockResolvedValue(location);
    mockTtyWriterSend.mockResolvedValue(undefined);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'continue', '--id', 'repo-a', '--wait', '--json']);

    expect(stdoutSpy).not.toHaveBeenCalled();
    const output = JSON.parse((logSpy.mock.calls[0]?.[0] ?? '') as string);
    expect(output).toEqual({
      target: {
        id: 'repo-a',
        name: 'repo-a',
        type: 'claude',
        pid: 10,
        status: AgentStatus.WAITING,
        summary: 'Waiting',
        projectPath: '/repo',
        sessionId: 'session-1',
        sessionFilePath: '/tmp/session.jsonl',
        lastActive: '2026-05-14T00:00:00.000Z',
      },
      prompt: 'continue',
      responseMessages: messages,
      elapsedMs: expect.any(Number),
      finalStatus: AgentStatus.WAITING,
    });
  });

  it('fails and does not send when --wait target has no session file', async () => {
    const agent = {
      name: 'repo-a',
      type: 'claude',
      status: AgentStatus.WAITING,
      summary: 'Waiting',
      lastActive: new Date(),
      pid: 10,
      sessionId: 'session-1',
    };
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'hello', '--id', 'repo-a', '--wait']);

    expect(ui.error).toHaveBeenCalledWith('Failed to send message: No session file found for agent "repo-a"; cannot wait for response.');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockTtyWriterSend).not.toHaveBeenCalled();
  });

  it('fails and does not send when --wait target has no adapter', async () => {
    const agent = {
      name: 'repo-a',
      type: 'claude',
      status: AgentStatus.WAITING,
      summary: 'Waiting',
      lastActive: new Date(),
      pid: 10,
      sessionId: 'session-1',
      sessionFilePath: '/tmp/session.jsonl',
    };
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockManager.getAdapter.mockReturnValue(undefined);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'hello', '--id', 'repo-a', '--wait']);

    expect(ui.error).toHaveBeenCalledWith('Failed to send message: Unsupported agent type: claude');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockTtyWriterSend).not.toHaveBeenCalled();
  });

  it('fails when --wait terminal cannot be found', async () => {
    const agent = {
      name: 'repo-a',
      type: 'claude',
      status: AgentStatus.WAITING,
      summary: 'Waiting',
      lastActive: new Date(),
      pid: 10,
      sessionId: 'session-1',
      sessionFilePath: '/tmp/session.jsonl',
    };
    mockManager.listAgents.mockResolvedValue([agent]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockManager.getAdapter.mockReturnValue(mockAgentAdapter);
    mockAgentAdapter.getConversation.mockReturnValue([]);
    mockFocusManager.findTerminal.mockResolvedValue(null);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'hello', '--id', 'repo-a', '--wait']);

    expect(ui.error).toHaveBeenCalledWith('Failed to send message: Cannot find terminal for agent "repo-a" (PID: 10).');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockTtyWriterSend).not.toHaveBeenCalled();
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

  it('does not warn when agent is idle and still sends', async () => {
    const agent = {
      name: 'repo-a',
      status: AgentStatus.IDLE,
      summary: 'Idle',
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

    expect(ui.warning).not.toHaveBeenCalled();
    expect(mockTtyWriterSend).toHaveBeenCalled();
    expect(ui.success).toHaveBeenCalledWith('Sent message to repo-a.');
  });

  it('writes busy-agent warning to stderr in --wait mode', async () => {
    const agent = {
      name: 'repo-a',
      type: 'claude',
      status: AgentStatus.RUNNING,
      summary: 'Running',
      lastActive: new Date(),
      pid: 10,
      sessionId: 'session-1',
      sessionFilePath: '/tmp/session.jsonl',
    };
    const location = { type: 'tmux', identifier: '0:1.0', tty: '/dev/ttys030' };
    mockManager.listAgents
      .mockResolvedValueOnce([agent])
      .mockResolvedValueOnce([{ ...agent, status: AgentStatus.WAITING }]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockManager.getAdapter.mockReturnValue(mockAgentAdapter);
    mockAgentAdapter.getConversation.mockReturnValue([]);
    mockFocusManager.findTerminal.mockResolvedValue(location);
    mockTtyWriterSend.mockResolvedValue(undefined);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'continue', '--id', 'repo-a', '--wait']);

    expect(stderrSpy).toHaveBeenCalledWith(
      'Agent "repo-a" is not waiting for input (status: running). Sending anyway.\n'
    );
    expect(ui.warning).not.toHaveBeenCalled();
    expect(mockTtyWriterSend).toHaveBeenCalledWith(location, 'continue');
  });

  it('sanitizes wait-mode status messages before writing to stderr', async () => {
    const agent = {
      name: '\x1b[31mrepo-a\x1b[0m',
      type: 'claude',
      status: AgentStatus.RUNNING,
      summary: 'Running',
      lastActive: new Date(),
      pid: 10,
      sessionId: 'session-1',
      sessionFilePath: '/tmp/session.jsonl',
    };
    const location = { type: 'tmux', identifier: '0:1.0', tty: '/dev/ttys030' };
    mockManager.listAgents
      .mockResolvedValueOnce([agent])
      .mockResolvedValueOnce([{ ...agent, status: AgentStatus.WAITING }]);
    mockManager.resolveAgent.mockReturnValue(agent);
    mockManager.getAdapter.mockReturnValue(mockAgentAdapter);
    mockAgentAdapter.getConversation.mockReturnValue([]);
    mockFocusManager.findTerminal.mockResolvedValue(location);
    mockTtyWriterSend.mockResolvedValue(undefined);

    const program = new Command();
    registerAgentCommand(program);
    await program.parseAsync(['node', 'test', 'agent', 'send', 'continue', '--id', 'repo-a', '--wait']);

    expect(stderrSpy).toHaveBeenCalledWith(
      'Agent "repo-a" is not waiting for input (status: running). Sending anyway.\n'
    );
    expect(stderrSpy).toHaveBeenCalledWith('Agent "repo-a" returned to waiting without assistant output.\n');
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

  describe('sessions', () => {
    function makeSession(overrides: Record<string, unknown> = {}) {
      return {
        type: 'claude',
        sessionId: 'sess-1',
        cwd: '/repo',
        firstUserMessage: 'hello',
        lastActive: new Date('2025-01-01T00:00:00Z'),
        startedAt: new Date('2025-01-01T00:00:00Z'),
        sessionFilePath: '/tmp/sess-1.jsonl',
        ...overrides,
      };
    }

    it('passes process.cwd() as the default cwd filter', async () => {
      mockManager.listSessions.mockResolvedValue([]);
      const cwd = process.cwd();

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'sessions']);

      expect(mockManager.listSessions).toHaveBeenCalledWith({ cwd, type: undefined });
    });

    it('clears the cwd filter when --all is set', async () => {
      mockManager.listSessions.mockResolvedValue([]);

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'sessions', '--all']);

      expect(mockManager.listSessions).toHaveBeenCalledWith({ cwd: undefined, type: undefined });
    });

    it('forwards --type to the manager', async () => {
      mockManager.listSessions.mockResolvedValue([]);

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'sessions', '--all', '--type', 'codex']);

      expect(mockManager.listSessions).toHaveBeenCalledWith({ cwd: undefined, type: 'codex' });
    });

    it('emits JSON with ISO date strings for --json', async () => {
      const session = makeSession();
      mockManager.listSessions.mockResolvedValue([session]);

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'sessions', '--all', '--json']);

      const printed = (logSpy.mock.calls[0]?.[0] ?? '') as string;
      const parsed = JSON.parse(printed);
      expect(parsed).toEqual([
        {
          type: 'claude',
          sessionId: 'sess-1',
          cwd: '/repo',
          firstUserMessage: 'hello',
          lastActive: '2025-01-01T00:00:00.000Z',
          startedAt: '2025-01-01T00:00:00.000Z',
          sessionFilePath: '/tmp/sess-1.jsonl',
        },
      ]);
    });

    it('renders the table with the documented column order', async () => {
      const session = makeSession({ firstUserMessage: 'real first prompt' });
      mockManager.listSessions.mockResolvedValue([session]);

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'sessions', '--all']);

      expect(ui.table).toHaveBeenCalledTimes(1);
      const tableArg = (ui.table as Mock).mock.calls[0][0] as {
        headers: string[];
        rows: string[][];
      };
      expect(tableArg.headers).toEqual([
        'Type',
        'Session ID',
        'CWD',
        'First Message',
        'Last Active',
      ]);
      expect(tableArg.rows).toHaveLength(1);
      const [, idCell, , firstMsgCell] = tableArg.rows[0];
      expect(idCell).toBe('sess-1');
      expect(firstMsgCell).toBe('real first prompt');
    });

    it('shows the --all hint when default-cwd lookup is empty', async () => {
      mockManager.listSessions.mockResolvedValue([]);

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'sessions']);

      const infoCalls = (ui.info as Mock).mock.calls.map((c: unknown[]) => c[0]);
      expect(infoCalls.some((m: unknown) => typeof m === 'string' && m.includes('--all'))).toBe(true);
    });

    it('substitutes "(no message yet)" placeholder in the table for empty firstUserMessage', async () => {
      mockManager.listSessions.mockResolvedValue([makeSession({ firstUserMessage: '' })]);

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'sessions', '--all']);

      const tableArg = (ui.table as Mock).mock.calls[0][0] as { rows: string[][] };
      expect(tableArg.rows[0][3]).toBe('(no message yet)');
    });

    it('keeps empty firstUserMessage raw in --json output', async () => {
      mockManager.listSessions.mockResolvedValue([makeSession({ firstUserMessage: '' })]);

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'sessions', '--all', '--json']);

      const parsed = JSON.parse((logSpy.mock.calls[0]?.[0] ?? '') as string) as Array<{
        firstUserMessage: string;
      }>;
      expect(parsed[0].firstUserMessage).toBe('');
    });

    it('applies --limit by slicing after merge', async () => {
      const sessions = [
        makeSession({ sessionId: 's1' }),
        makeSession({ sessionId: 's2' }),
        makeSession({ sessionId: 's3' }),
      ];
      mockManager.listSessions.mockResolvedValue(sessions);

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'sessions', '--all', '--limit', '2', '--json']);

      const parsed = JSON.parse((logSpy.mock.calls[0]?.[0] ?? '') as string) as Array<{ sessionId: string }>;
      expect(parsed.map((s) => s.sessionId)).toEqual(['s1', 's2']);
    });
  });

  describe('session detail', () => {
    function makeSession(overrides: Record<string, unknown> = {}) {
      return {
        type: 'claude',
        sessionId: 'sess-1',
        cwd: '/repo',
        firstUserMessage: 'hello',
        lastActive: new Date('2025-01-01T01:00:00Z'),
        startedAt: new Date('2025-01-01T00:00:00Z'),
        sessionFilePath: '/tmp/sess-1.jsonl',
        ...overrides,
      };
    }

    it('finds a historical session by id and renders detail without requiring a running agent', async () => {
      mockManager.listSessions.mockResolvedValue([makeSession()]);
      mockManager.getAdapter.mockReturnValue(mockAgentAdapter);
      mockAgentAdapter.getConversation.mockReturnValue([
        { role: 'user', content: 'first', timestamp: '2025-01-01T00:00:00.000Z' },
        { role: 'assistant', content: 'second', timestamp: '2025-01-01T00:00:01.000Z' },
      ]);

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'session', 'detail', '--id', 'sess-1']);

      expect(mockManager.listSessions).toHaveBeenCalledWith({ cwd: undefined });
      expect(mockManager.listAgents).not.toHaveBeenCalled();
      expect(mockManager.getAdapter).toHaveBeenCalledWith('claude');
      expect(mockAgentAdapter.getConversation).toHaveBeenCalledWith('/tmp/sess-1.jsonl', { verbose: undefined });
      expect(ui.text).toHaveBeenCalledWith('Session Detail', { breakline: true });
    });

    it('emits JSON for a historical session detail and honors --tail', async () => {
      mockManager.listSessions.mockResolvedValue([makeSession()]);
      mockManager.getAdapter.mockReturnValue(mockAgentAdapter);
      mockAgentAdapter.getConversation.mockReturnValue([
        { role: 'user', content: 'one', timestamp: '2025-01-01T00:00:00.000Z' },
        { role: 'assistant', content: 'two', timestamp: '2025-01-01T00:00:01.000Z' },
      ]);

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'session', 'detail', '--id', 'sess-1', '--tail', '1', '--json']);

      const parsed = JSON.parse((logSpy.mock.calls[0]?.[0] ?? '') as string);
      expect(parsed).toEqual({
        sessionId: 'sess-1',
        cwd: '/repo',
        startTime: '2025-01-01T00:00:00.000Z',
        lastActive: '2025-01-01T01:00:00.000Z',
        type: 'claude',
        sessionFilePath: '/tmp/sess-1.jsonl',
        conversation: [
          { role: 'assistant', content: 'two', timestamp: '2025-01-01T00:00:01.000Z' },
        ],
      });
    });

    it('shows a clear error when the session id is not found', async () => {
      mockManager.listSessions.mockResolvedValue([makeSession()]);

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'session', 'detail', '--id', 'missing']);

      expect(ui.error).toHaveBeenCalledWith('No session found matching "missing".');
      expect(mockManager.getAdapter).not.toHaveBeenCalled();
    });

    it('forwards --type when resolving a historical session', async () => {
      mockManager.listSessions.mockResolvedValue([makeSession({ type: 'codex' })]);
      mockManager.getAdapter.mockReturnValue(mockAgentAdapter);
      mockAgentAdapter.getConversation.mockReturnValue([]);

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'session', 'detail', '--id', 'sess-1', '--type', 'codex']);

      expect(mockManager.listSessions).toHaveBeenCalledWith({ cwd: undefined, type: 'codex' });
    });

    it('accepts opencode as a historical session detail type filter', async () => {
      mockManager.listSessions.mockResolvedValue([makeSession({ type: 'opencode' })]);
      mockManager.getAdapter.mockReturnValue(mockAgentAdapter);
      mockAgentAdapter.getConversation.mockReturnValue([]);

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'session', 'detail', '--id', 'sess-1', '--type', 'opencode']);

      expect(mockManager.listSessions).toHaveBeenCalledWith({ cwd: undefined, type: 'opencode' });
    });
  });

  describe('agent rename', () => {
    it('calls registry.rename and prints success', async () => {
      mockRegistry.rename.mockReturnValue(undefined);

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'rename', 'old-name', 'new-name']);

      expect(mockRegistry.rename).toHaveBeenCalledWith('old-name', 'new-name');
      expect(ui.success).toHaveBeenCalledWith('Agent "old-name" renamed to "new-name".');
    });

    it('exits with error when new name has invalid format', async () => {
      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'rename', 'old-name', 'INVALID NAME']);

      expect(mockRegistry.rename).not.toHaveBeenCalled();
      expect(ui.error).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('prints info and exits 0 when current and new name are the same', async () => {
      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'rename', 'same-name', 'same-name']);

      expect(mockRegistry.rename).not.toHaveBeenCalled();
      expect(ui.info).toHaveBeenCalled();
    });

    it('shows error and exits 1 when agent is not found', async () => {
      mockRegistry.rename.mockImplementation(() => { throw new RenameNotFoundError('old-name'); });

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'rename', 'old-name', 'new-name']);

      expect(ui.error).toHaveBeenCalledWith('Agent "old-name" not found in registry.');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('shows error and exits 1 when new name is already in use', async () => {
      mockRegistry.rename.mockImplementation(() => { throw new RenameConflictError('new-name'); });

      const program = new Command();
      registerAgentCommand(program);
      await program.parseAsync(['node', 'test', 'agent', 'rename', 'old-name', 'new-name']);

      expect(ui.error).toHaveBeenCalledWith('Agent "new-name" is already in use. Choose a different name.');
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});
