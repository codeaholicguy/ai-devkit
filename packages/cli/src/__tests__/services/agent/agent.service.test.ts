import { describe, expect, it, jest } from '@jest/globals';
import { AgentStatus, type AgentInfo, type ConversationMessage } from '@ai-devkit/agent-manager';
import { waitForAgentResponse } from '../../../services/agent/agent.service';

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
      listAgents: jest.fn<() => Promise<AgentInfo[]>>()
        .mockResolvedValueOnce([running])
        .mockResolvedValueOnce([waiting]),
    };
    const adapter = {
      getConversation: jest.fn<() => ConversationMessage[]>().mockReturnValue(conversation),
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
      listAgents: jest.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([]),
    };
    const adapter = {
      getConversation: jest.fn<() => ConversationMessage[]>().mockReturnValue([]),
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
      onAssistantMessage: jest.fn(),
    })).rejects.toThrow('Agent "repo-a" is no longer running.');
  });

  it('tracks the same target by session id when pid is not matched', async () => {
    const waiting = makeAgent({
      pid: 99,
      sessionId: 'session-1',
      status: AgentStatus.WAITING,
    });
    const manager = {
      listAgents: jest.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([waiting]),
    };
    const adapter = {
      getConversation: jest.fn<() => ConversationMessage[]>().mockReturnValue([
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
      listAgents: jest.fn<() => Promise<AgentInfo[]>>()
        .mockResolvedValueOnce([running])
        .mockResolvedValueOnce([waiting]),
    };
    const adapter = {
      getConversation: jest.fn<() => ConversationMessage[]>()
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
      listAgents: jest.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([waiting]),
    };
    const adapter = {
      getConversation: jest.fn<() => ConversationMessage[]>()
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
      listAgents: jest.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([idle]),
    };
    const adapter = {
      getConversation: jest.fn<() => ConversationMessage[]>().mockReturnValue([
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
      listAgents: jest.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([idle]),
    };
    const adapter = {
      getConversation: jest.fn<() => ConversationMessage[]>().mockReturnValue([
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
      onAssistantMessage: jest.fn(),
    })).rejects.toThrow('Timed out waiting for agent "repo-a" after 5ms.');
  });

  it('reports status when the agent finishes without assistant text', async () => {
    const waiting = makeAgent({ status: AgentStatus.WAITING });
    const manager = {
      listAgents: jest.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([waiting]),
    };
    const adapter = {
      getConversation: jest.fn<() => ConversationMessage[]>().mockReturnValue([
        makeMessage({ role: 'user', content: 'new prompt' }),
      ]),
    };
    const onStatus = jest.fn<(message: string) => void>();

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
      onAssistantMessage: jest.fn(),
      onStatus,
    });

    expect(result.messages).toEqual([]);
    expect(onStatus).toHaveBeenCalledWith('Agent "repo-a" returned to waiting without assistant output.');
  });

  it('waits for the configured poll interval before polling again', async () => {
    jest.useFakeTimers();
    try {
      const running = makeAgent({ status: AgentStatus.RUNNING });
      const waiting = makeAgent({ status: AgentStatus.WAITING });
      const manager = {
        listAgents: jest.fn<() => Promise<AgentInfo[]>>()
          .mockResolvedValueOnce([running])
          .mockResolvedValueOnce([waiting]),
      };
      const adapter = {
        getConversation: jest.fn<() => ConversationMessage[]>().mockReturnValue([
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
        onAssistantMessage: jest.fn(),
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(manager.listAgents).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(25);
      const result = await promise;

      expect(result.finalStatus).toBe(AgentStatus.WAITING);
      expect(manager.listAgents).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('fails after the defensive timeout is reached', async () => {
    const running = makeAgent({ status: AgentStatus.RUNNING });
    const manager = {
      listAgents: jest.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([running]),
    };
    const adapter = {
      getConversation: jest.fn<() => ConversationMessage[]>().mockReturnValue([]),
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
      onAssistantMessage: jest.fn(),
    })).rejects.toThrow('Timed out waiting for agent "repo-a" after 0ms.');
  });

  it('does not sleep past the remaining timeout', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    let assertionError: unknown;

    try {
      const running = makeAgent({ status: AgentStatus.RUNNING });
      const manager = {
        listAgents: jest.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([running]),
      };
      const adapter = {
        getConversation: jest.fn<() => ConversationMessage[]>().mockReturnValue([]),
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
        onAssistantMessage: jest.fn(),
      });

      await Promise.resolve();
      await Promise.resolve();

      try {
        expect(setTimeoutSpy.mock.calls[0]?.[1]).toBe(10);
      } catch (error) {
        assertionError = error;
      }

      jest.advanceTimersByTime(25);
      await expect(promise).rejects.toThrow('Timed out waiting for agent "repo-a" after 10ms.');

      if (assertionError) {
        throw assertionError;
      }
    } finally {
      setTimeoutSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('uses the configured timeout label in timeout errors', async () => {
    const running = makeAgent({ status: AgentStatus.RUNNING });
    const manager = {
      listAgents: jest.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([running]),
    };
    const adapter = {
      getConversation: jest.fn<() => ConversationMessage[]>().mockReturnValue([]),
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
      onAssistantMessage: jest.fn(),
    })).rejects.toThrow('Timed out waiting for agent "repo-a" after 1500ms.');
  });
});
