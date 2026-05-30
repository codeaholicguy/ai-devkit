
import {
  AgentStatus,
  type AgentInfo,
  type AgentRegistry,
  type ConversationMessage,
  type RegistryEntry,
  type TmuxManager,
} from '@ai-devkit/agent-manager';
import {
  waitForAgentResponse,
  startAgent,
  AgentNameInUseError,
  AgentPidPollTimeoutError,
  TmuxUnavailableError,
} from '../../../services/agent/agent.service.js';

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    name: 'repo-a',
    type: 'claude',
    status: AgentStatus.RUNNING,
    summary: 'Working',
    pid: 10,
    projectPath: '/repo',
    sessionId: 'session-1',
    sessionFilePath: '/tmp/session.jsonl',
    lastActive: new Date('2026-05-14T00:00:00.000Z'),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    role: 'assistant',
    content: 'response',
    timestamp: '2026-05-14T00:00:01.000Z',
    ...overrides,
  };
}

describe('waitForAgentResponse', () => {
  it('emits only new non-empty assistant messages and stops when the same agent is waiting', async () => {
    const running = makeAgent({ status: AgentStatus.RUNNING });
    const waiting = makeAgent({ status: AgentStatus.WAITING });
    const conversation = [
      makeMessage({ role: 'user', content: 'historical prompt' }),
      makeMessage({ role: 'assistant', content: 'historical response' }),
      makeMessage({ role: 'user', content: 'new prompt' }),
      makeMessage({ role: 'assistant', content: '' }),
      makeMessage({ role: 'system', content: 'system note' }),
      makeMessage({ role: 'assistant', content: 'new response' }),
    ];
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>()
        .mockResolvedValueOnce([running])
        .mockResolvedValueOnce([waiting]),
    };
    const adapter = {
      getConversation: vi.fn<() => ConversationMessage[]>().mockReturnValue(conversation),
    };
    const emitted: ConversationMessage[] = [];

    const result = await waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: 'repo-a',
        name: 'repo-a',
        type: 'claude',
        pid: 10,
        sessionId: 'session-1',
        sessionFilePath: '/tmp/session.jsonl',
      },
      initialMessageCount: 2,
      options: { pollIntervalMs: 0, maxWaitMs: 1000 },
      onAssistantMessage: (message) => emitted.push(message),
    });

    expect(emitted.map((message) => message.content)).toEqual(['new response']);
    expect(result.finalStatus).toBe(AgentStatus.WAITING);
    expect(result.messages.map((message) => message.content)).toEqual(['new response']);
  });

  it('fails when the target agent disappears while waiting', async () => {
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([]),
    };
    const adapter = {
      getConversation: vi.fn<() => ConversationMessage[]>().mockReturnValue([]),
    };

    await expect(waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: 'repo-a',
        name: 'repo-a',
        type: 'claude',
        pid: 10,
        sessionId: 'session-1',
        sessionFilePath: '/tmp/session.jsonl',
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 0, maxWaitMs: 1000 },
      onAssistantMessage: vi.fn(),
    })).rejects.toThrow('Agent "repo-a" is no longer running.');
  });

  it('tracks the same target by session id when pid is not matched', async () => {
    const waiting = makeAgent({
      pid: 99,
      sessionId: 'session-1',
      status: AgentStatus.WAITING,
    });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([waiting]),
    };
    const adapter = {
      getConversation: vi.fn<() => ConversationMessage[]>().mockReturnValue([
        makeMessage({ role: 'assistant', content: 'session response' }),
      ]),
    };
    const emitted: ConversationMessage[] = [];

    const result = await waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: 'repo-a',
        name: 'repo-a',
        type: 'claude',
        pid: 10,
        sessionId: 'session-1',
        sessionFilePath: '/tmp/session.jsonl',
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 0, maxWaitMs: 1000 },
      onAssistantMessage: (message) => emitted.push(message),
    });

    expect(result.finalStatus).toBe(AgentStatus.WAITING);
    expect(emitted.map((message) => message.content)).toEqual(['session response']);
  });

  it('continues after transient transcript read errors', async () => {
    const running = makeAgent({ status: AgentStatus.RUNNING });
    const waiting = makeAgent({ status: AgentStatus.WAITING });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>()
        .mockResolvedValueOnce([running])
        .mockResolvedValueOnce([waiting]),
    };
    const adapter = {
      getConversation: vi.fn<() => ConversationMessage[]>()
        .mockImplementationOnce(() => {
          throw new Error('partial write');
        })
        .mockReturnValueOnce([makeMessage({ role: 'assistant', content: 'ok' })]),
    };
    const emitted: ConversationMessage[] = [];

    const result = await waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: 'repo-a',
        name: 'repo-a',
        type: 'claude',
        pid: 10,
        sessionId: 'session-1',
        sessionFilePath: '/tmp/session.jsonl',
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 0, maxWaitMs: 1000 },
      onAssistantMessage: (message) => emitted.push(message),
    });

    expect(result.finalStatus).toBe(AgentStatus.WAITING);
    expect(emitted.map((message) => message.content)).toEqual(['ok']);
  });

  it('does not finish on waiting status until transcript read succeeds', async () => {
    const waiting = makeAgent({ status: AgentStatus.WAITING });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([waiting]),
    };
    const adapter = {
      getConversation: vi.fn<() => ConversationMessage[]>()
        .mockImplementationOnce(() => {
          throw new Error('partial write');
        })
        .mockReturnValueOnce([makeMessage({ role: 'assistant', content: 'final response' })]),
    };
    const emitted: ConversationMessage[] = [];

    const result = await waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: 'repo-a',
        name: 'repo-a',
        type: 'claude',
        pid: 10,
        sessionId: 'session-1',
        sessionFilePath: '/tmp/session.jsonl',
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 0, maxWaitMs: 1000 },
      onAssistantMessage: (message) => emitted.push(message),
    });

    expect(adapter.getConversation).toHaveBeenCalledTimes(2);
    expect(result.finalStatus).toBe(AgentStatus.WAITING);
    expect(emitted.map((message) => message.content)).toEqual(['final response']);
  });

  it('stops when the agent becomes idle after assistant output', async () => {
    const idle = makeAgent({ status: AgentStatus.IDLE });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([idle]),
    };
    const adapter = {
      getConversation: vi.fn<() => ConversationMessage[]>().mockReturnValue([
        makeMessage({ role: 'assistant', content: 'idle response' }),
      ]),
    };
    const emitted: ConversationMessage[] = [];

    const result = await waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: 'repo-a',
        name: 'repo-a',
        type: 'claude',
        pid: 10,
        sessionId: 'session-1',
        sessionFilePath: '/tmp/session.jsonl',
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 1, maxWaitMs: 10 },
      onAssistantMessage: (message) => emitted.push(message),
    });

    expect(result.finalStatus as AgentStatus).toBe(AgentStatus.IDLE);
    expect(emitted.map((message) => message.content)).toEqual(['idle response']);
  });

  it('does not stop on idle status before assistant output', async () => {
    const idle = makeAgent({ status: AgentStatus.IDLE });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([idle]),
    };
    const adapter = {
      getConversation: vi.fn<() => ConversationMessage[]>().mockReturnValue([
        makeMessage({ role: 'user', content: 'new prompt' }),
      ]),
    };

    await expect(waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: 'repo-a',
        name: 'repo-a',
        type: 'claude',
        pid: 10,
        sessionId: 'session-1',
        sessionFilePath: '/tmp/session.jsonl',
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 1, maxWaitMs: 5 },
      onAssistantMessage: vi.fn(),
    })).rejects.toThrow('Timed out waiting for agent "repo-a" after 5ms.');
  });

  it('reports status when the agent finishes without assistant text', async () => {
    const waiting = makeAgent({ status: AgentStatus.WAITING });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([waiting]),
    };
    const adapter = {
      getConversation: vi.fn<() => ConversationMessage[]>().mockReturnValue([
        makeMessage({ role: 'user', content: 'new prompt' }),
      ]),
    };
    const onStatus = vi.fn<(message: string) => void>();

    const result = await waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: 'repo-a',
        name: 'repo-a',
        type: 'claude',
        pid: 10,
        sessionId: 'session-1',
        sessionFilePath: '/tmp/session.jsonl',
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 0, maxWaitMs: 1000 },
      onAssistantMessage: vi.fn(),
      onStatus,
    });

    expect(result.messages).toEqual([]);
    expect(onStatus).toHaveBeenCalledWith('Agent "repo-a" returned to waiting without assistant output.');
  });

  it('waits for the configured poll interval before polling again', async () => {
    vi.useFakeTimers();
    try {
      const running = makeAgent({ status: AgentStatus.RUNNING });
      const waiting = makeAgent({ status: AgentStatus.WAITING });
      const manager = {
        listAgents: vi.fn<() => Promise<AgentInfo[]>>()
          .mockResolvedValueOnce([running])
          .mockResolvedValueOnce([waiting]),
      };
      const adapter = {
        getConversation: vi.fn<() => ConversationMessage[]>().mockReturnValue([
          makeMessage({ role: 'assistant', content: 'delayed response' }),
        ]),
      };

      const promise = waitForAgentResponse({
        manager,
        adapter,
        target: {
          id: 'repo-a',
          name: 'repo-a',
          type: 'claude',
          pid: 10,
          sessionId: 'session-1',
          sessionFilePath: '/tmp/session.jsonl',
        },
        initialMessageCount: 0,
        options: { pollIntervalMs: 25, maxWaitMs: 1000 },
        onAssistantMessage: vi.fn(),
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(manager.listAgents).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(25);
      const result = await promise;

      expect(result.finalStatus).toBe(AgentStatus.WAITING);
      expect(manager.listAgents).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails after the defensive timeout is reached', async () => {
    const running = makeAgent({ status: AgentStatus.RUNNING });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([running]),
    };
    const adapter = {
      getConversation: vi.fn<() => ConversationMessage[]>().mockReturnValue([]),
    };

    await expect(waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: 'repo-a',
        name: 'repo-a',
        type: 'claude',
        pid: 10,
        sessionId: 'session-1',
        sessionFilePath: '/tmp/session.jsonl',
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 0, maxWaitMs: 0 },
      onAssistantMessage: vi.fn(),
    })).rejects.toThrow('Timed out waiting for agent "repo-a" after 0ms.');
  });

  it('does not sleep past the remaining timeout', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    let assertionError: unknown;

    try {
      const running = makeAgent({ status: AgentStatus.RUNNING });
      const manager = {
        listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([running]),
      };
      const adapter = {
        getConversation: vi.fn<() => ConversationMessage[]>().mockReturnValue([]),
      };

      const promise = waitForAgentResponse({
        manager,
        adapter,
        target: {
          id: 'repo-a',
          name: 'repo-a',
          type: 'claude',
          pid: 10,
          sessionId: 'session-1',
          sessionFilePath: '/tmp/session.jsonl',
        },
        initialMessageCount: 0,
        options: { pollIntervalMs: 25, maxWaitMs: 10 },
        onAssistantMessage: vi.fn(),
      });

      await Promise.resolve();
      await Promise.resolve();

      try {
        expect(setTimeoutSpy.mock.calls[0]?.[1]).toBe(10);
      } catch (error) {
        assertionError = error;
      }

      vi.advanceTimersByTime(25);
      await expect(promise).rejects.toThrow('Timed out waiting for agent "repo-a" after 10ms.');

      if (assertionError) {
        throw assertionError;
      }
    } finally {
      setTimeoutSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('uses the configured timeout label in timeout errors', async () => {
    const running = makeAgent({ status: AgentStatus.RUNNING });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([running]),
    };
    const adapter = {
      getConversation: vi.fn<() => ConversationMessage[]>().mockReturnValue([]),
    };

    await expect(waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: 'repo-a',
        name: 'repo-a',
        type: 'claude',
        pid: 10,
        sessionId: 'session-1',
        sessionFilePath: '/tmp/session.jsonl',
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 0, maxWaitMs: 0, timeoutLabel: '1500ms' },
      onAssistantMessage: vi.fn(),
    })).rejects.toThrow('Timed out waiting for agent "repo-a" after 1500ms.');
  });
});

function makeTmux(over: Partial<TmuxManager> = {}): TmuxManager {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    sessionExists: vi.fn().mockResolvedValue(false),
    createSession: vi.fn().mockResolvedValue(undefined),
    sendKeys: vi.fn().mockResolvedValue(undefined),
    killSession: vi.fn().mockResolvedValue(undefined),
    findAgentPid: vi.fn().mockResolvedValue(12345),
    ...over,
  } as unknown as TmuxManager;
}

function makeRegistry(over: Partial<AgentRegistry> = {}): AgentRegistry {
  return {
    prune: vi.fn(),
    lookup: vi.fn().mockReturnValue(null),
    list: vi.fn().mockReturnValue([]),
    register: vi.fn(),
    isAlive: vi.fn().mockReturnValue(false),
    ...over,
  } as unknown as AgentRegistry;
}

const startOpts = {
  type: 'claude' as const,
  name: 'agent1',
  cwd: '/work',
  pollIntervalMs: 1,
  pollTimeoutMs: 50,
};

describe('startAgent', () => {
  it('happy path: creates session, sends command, polls, registers, returns entry', async () => {
    const tmux = makeTmux();
    const registry = makeRegistry();

    const entry = await startAgent(startOpts, { tmux, registry });

    expect(tmux.createSession).toHaveBeenCalledWith('agent1', '/work');
    expect(tmux.sendKeys).toHaveBeenCalledWith('agent1', 'claude');
    expect(registry.prune).toHaveBeenCalled();
    expect(registry.register).toHaveBeenCalledOnce();
    expect(entry).toMatchObject({
      name: 'agent1',
      type: 'claude',
      pid: 12345,
      tmuxSession: 'agent1',
      cwd: '/work',
    });
    expect(entry.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('throws TmuxUnavailableError when tmux is missing', async () => {
    const tmux = makeTmux({ isAvailable: vi.fn().mockResolvedValue(false) } as Partial<TmuxManager>);
    const registry = makeRegistry();

    await expect(startAgent(startOpts, { tmux, registry })).rejects.toBeInstanceOf(TmuxUnavailableError);
    expect(tmux.createSession).not.toHaveBeenCalled();
    expect(registry.register).not.toHaveBeenCalled();
  });

  it('throws AgentNameInUseError when registry already has a live entry', async () => {
    const tmux = makeTmux();
    const liveEntry: RegistryEntry = {
      name: 'agent1', type: 'claude', pid: 999,
      tmuxSession: 'agent1', cwd: '/old', startedAt: '2026-01-01T00:00:00.000Z',
    };
    const registry = makeRegistry({ lookup: vi.fn().mockReturnValue(liveEntry) } as Partial<AgentRegistry>);

    const err = await startAgent(startOpts, { tmux, registry }).catch((e) => e);
    expect(err).toBeInstanceOf(AgentNameInUseError);
    expect(err.pid).toBe(999);
    expect(tmux.createSession).not.toHaveBeenCalled();
  });

  it('replaces orphan tmux session and calls onWarning', async () => {
    const tmux = makeTmux({ sessionExists: vi.fn().mockResolvedValue(true) } as Partial<TmuxManager>);
    const registry = makeRegistry();
    const onWarning = vi.fn();

    await startAgent(startOpts, { tmux, registry, onWarning });

    expect(onWarning).toHaveBeenCalledOnce();
    expect(onWarning.mock.calls[0][0]).toContain('agent1');
    expect(tmux.killSession).toHaveBeenCalledWith('agent1');
    expect(tmux.createSession).toHaveBeenCalledWith('agent1', '/work');
  });

  it('on PID poll timeout: kills session and throws AgentPidPollTimeoutError', async () => {
    const tmux = makeTmux({ findAgentPid: vi.fn().mockResolvedValue(null) } as Partial<TmuxManager>);
    const registry = makeRegistry();

    const err = await startAgent(startOpts, { tmux, registry }).catch((e) => e);

    expect(err).toBeInstanceOf(AgentPidPollTimeoutError);
    expect(err.command).toBe('claude');
    expect(err.timeoutMs).toBe(50);
    expect(tmux.killSession).toHaveBeenLastCalledWith('agent1');
    expect(registry.register).not.toHaveBeenCalled();
  });

  it('keeps polling until findAgentPid returns a PID', async () => {
    const findAgentPid = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(42);
    const tmux = makeTmux({ findAgentPid } as Partial<TmuxManager>);
    const registry = makeRegistry();

    const entry = await startAgent(startOpts, { tmux, registry });

    expect(findAgentPid).toHaveBeenCalledTimes(3);
    expect(entry.pid).toBe(42);
  });

  it('prunes registry before checking for name collision', async () => {
    const tmux = makeTmux();
    const registry = makeRegistry();
    const order: string[] = [];
    (registry.prune as any).mockImplementation(() => order.push('prune'));
    (registry.lookup as any).mockImplementation(() => {
      order.push('lookup');
      return null;
    });

    await startAgent(startOpts, { tmux, registry });
    expect(order).toEqual(['prune', 'lookup']);
  });
});
