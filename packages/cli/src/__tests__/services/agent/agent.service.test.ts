import { AgentStatus, type AgentInfo, type ConversationMessage } from "@ai-devkit/agent-manager";
import {
  waitForAgentResponse,
  assertSendTargetOptions,
  sendToAgentGroup,
} from "../../../services/agent/agent.service.js";

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    name: "repo-a",
    type: "claude",
    status: AgentStatus.RUNNING,
    summary: "Working",
    pid: 10,
    projectPath: "/repo",
    sessionId: "session-1",
    sessionFilePath: "/tmp/session.jsonl",
    lastActive: new Date("2026-05-14T00:00:00.000Z"),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    role: "assistant",
    content: "response",
    timestamp: "2026-05-14T00:00:01.000Z",
    ...overrides,
  };
}

describe("waitForAgentResponse", () => {
  it("emits only new non-empty assistant messages and stops when the same agent is waiting", async () => {
    const running = makeAgent({ status: AgentStatus.RUNNING });
    const waiting = makeAgent({ status: AgentStatus.WAITING });
    const conversation = [
      makeMessage({ role: "user", content: "historical prompt" }),
      makeMessage({ role: "assistant", content: "historical response" }),
      makeMessage({ role: "user", content: "new prompt" }),
      makeMessage({ role: "assistant", content: "" }),
      makeMessage({ role: "system", content: "system note" }),
      makeMessage({ role: "assistant", content: "new response" }),
    ];
    const manager = {
      listAgents: vi
        .fn<() => Promise<AgentInfo[]>>()
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
        id: "repo-a",
        name: "repo-a",
        type: "claude",
        pid: 10,
        sessionId: "session-1",
        sessionFilePath: "/tmp/session.jsonl",
      },
      initialMessageCount: 2,
      options: { pollIntervalMs: 0, maxWaitMs: 1000 },
      onAssistantMessage: (message) => emitted.push(message),
    });

    expect(emitted.map((message) => message.content)).toEqual(["new response"]);
    expect(result.finalStatus).toBe(AgentStatus.WAITING);
    expect(result.messages.map((message) => message.content)).toEqual(["new response"]);
  });

  it("fails when the target agent disappears while waiting", async () => {
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([]),
    };
    const adapter = {
      getConversation: vi.fn<() => ConversationMessage[]>().mockReturnValue([]),
    };

    await expect(
      waitForAgentResponse({
        manager,
        adapter,
        target: {
          id: "repo-a",
          name: "repo-a",
          type: "claude",
          pid: 10,
          sessionId: "session-1",
          sessionFilePath: "/tmp/session.jsonl",
        },
        initialMessageCount: 0,
        options: { pollIntervalMs: 0, maxWaitMs: 1000 },
        onAssistantMessage: vi.fn(),
      }),
    ).rejects.toThrow('Agent "repo-a" is no longer running.');
  });

  it("tracks the same target by session id when pid is not matched", async () => {
    const waiting = makeAgent({
      pid: 99,
      sessionId: "session-1",
      status: AgentStatus.WAITING,
    });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([waiting]),
    };
    const adapter = {
      getConversation: vi
        .fn<() => ConversationMessage[]>()
        .mockReturnValue([makeMessage({ role: "assistant", content: "session response" })]),
    };
    const emitted: ConversationMessage[] = [];

    const result = await waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: "repo-a",
        name: "repo-a",
        type: "claude",
        pid: 10,
        sessionId: "session-1",
        sessionFilePath: "/tmp/session.jsonl",
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 0, maxWaitMs: 1000 },
      onAssistantMessage: (message) => emitted.push(message),
    });

    expect(result.finalStatus).toBe(AgentStatus.WAITING);
    expect(emitted.map((message) => message.content)).toEqual(["session response"]);
  });

  it("continues after transient transcript read errors", async () => {
    const running = makeAgent({ status: AgentStatus.RUNNING });
    const waiting = makeAgent({ status: AgentStatus.WAITING });
    const manager = {
      listAgents: vi
        .fn<() => Promise<AgentInfo[]>>()
        .mockResolvedValueOnce([running])
        .mockResolvedValueOnce([waiting]),
    };
    const adapter = {
      getConversation: vi
        .fn<() => ConversationMessage[]>()
        .mockImplementationOnce(() => {
          throw new Error("partial write");
        })
        .mockReturnValueOnce([makeMessage({ role: "assistant", content: "ok" })]),
    };
    const emitted: ConversationMessage[] = [];

    const result = await waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: "repo-a",
        name: "repo-a",
        type: "claude",
        pid: 10,
        sessionId: "session-1",
        sessionFilePath: "/tmp/session.jsonl",
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 0, maxWaitMs: 1000 },
      onAssistantMessage: (message) => emitted.push(message),
    });

    expect(result.finalStatus).toBe(AgentStatus.WAITING);
    expect(emitted.map((message) => message.content)).toEqual(["ok"]);
  });

  it("does not finish on waiting status until transcript read succeeds", async () => {
    const waiting = makeAgent({ status: AgentStatus.WAITING });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([waiting]),
    };
    const adapter = {
      getConversation: vi
        .fn<() => ConversationMessage[]>()
        .mockImplementationOnce(() => {
          throw new Error("partial write");
        })
        .mockReturnValueOnce([makeMessage({ role: "assistant", content: "final response" })]),
    };
    const emitted: ConversationMessage[] = [];

    const result = await waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: "repo-a",
        name: "repo-a",
        type: "claude",
        pid: 10,
        sessionId: "session-1",
        sessionFilePath: "/tmp/session.jsonl",
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 0, maxWaitMs: 1000 },
      onAssistantMessage: (message) => emitted.push(message),
    });

    expect(adapter.getConversation).toHaveBeenCalledTimes(2);
    expect(result.finalStatus).toBe(AgentStatus.WAITING);
    expect(emitted.map((message) => message.content)).toEqual(["final response"]);
  });

  it("stops when the agent becomes idle after assistant output", async () => {
    const idle = makeAgent({ status: AgentStatus.IDLE });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([idle]),
    };
    const adapter = {
      getConversation: vi
        .fn<() => ConversationMessage[]>()
        .mockReturnValue([makeMessage({ role: "assistant", content: "idle response" })]),
    };
    const emitted: ConversationMessage[] = [];

    const result = await waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: "repo-a",
        name: "repo-a",
        type: "claude",
        pid: 10,
        sessionId: "session-1",
        sessionFilePath: "/tmp/session.jsonl",
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 1, maxWaitMs: 10 },
      onAssistantMessage: (message) => emitted.push(message),
    });

    expect(result.finalStatus as AgentStatus).toBe(AgentStatus.IDLE);
    expect(emitted.map((message) => message.content)).toEqual(["idle response"]);
  });

  it("does not stop on idle status before assistant output", async () => {
    const idle = makeAgent({ status: AgentStatus.IDLE });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([idle]),
    };
    const adapter = {
      getConversation: vi
        .fn<() => ConversationMessage[]>()
        .mockReturnValue([makeMessage({ role: "user", content: "new prompt" })]),
    };

    await expect(
      waitForAgentResponse({
        manager,
        adapter,
        target: {
          id: "repo-a",
          name: "repo-a",
          type: "claude",
          pid: 10,
          sessionId: "session-1",
          sessionFilePath: "/tmp/session.jsonl",
        },
        initialMessageCount: 0,
        options: { pollIntervalMs: 1, maxWaitMs: 5 },
        onAssistantMessage: vi.fn(),
      }),
    ).rejects.toThrow('Timed out waiting for agent "repo-a" after 5ms.');
  });

  it("reports status when the agent finishes without assistant text", async () => {
    const waiting = makeAgent({ status: AgentStatus.WAITING });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([waiting]),
    };
    const adapter = {
      getConversation: vi
        .fn<() => ConversationMessage[]>()
        .mockReturnValue([makeMessage({ role: "user", content: "new prompt" })]),
    };
    const onStatus = vi.fn<(message: string) => void>();

    const result = await waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: "repo-a",
        name: "repo-a",
        type: "claude",
        pid: 10,
        sessionId: "session-1",
        sessionFilePath: "/tmp/session.jsonl",
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 0, maxWaitMs: 1000, emptyWaitingGraceMs: 0 },
      onAssistantMessage: vi.fn(),
      onStatus,
    });

    expect(result.messages).toEqual([]);
    expect(onStatus).toHaveBeenCalledWith(
      'Agent "repo-a" returned to waiting without assistant output.',
    );
  });

  it("keeps polling briefly when waiting status appears before assistant transcript output", async () => {
    const waiting = makeAgent({ status: AgentStatus.WAITING });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([waiting]),
    };
    const adapter = {
      getConversation: vi
        .fn<() => ConversationMessage[]>()
        .mockReturnValueOnce([makeMessage({ role: "user", content: "new prompt" })])
        .mockReturnValueOnce([
          makeMessage({ role: "user", content: "new prompt" }),
          makeMessage({ role: "assistant", content: "flushed response" }),
        ]),
    };
    const onAssistantMessage = vi.fn();
    const onStatus = vi.fn<(message: string) => void>();

    const result = await waitForAgentResponse({
      manager,
      adapter,
      target: {
        id: "repo-a",
        name: "repo-a",
        type: "claude",
        pid: 10,
        sessionId: "session-1",
        sessionFilePath: "/tmp/session.jsonl",
      },
      initialMessageCount: 0,
      options: { pollIntervalMs: 0, maxWaitMs: 1000 },
      onAssistantMessage,
      onStatus,
    });

    expect(result.messages).toEqual([
      expect.objectContaining({ role: "assistant", content: "flushed response" }),
    ]);
    expect(onAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: "assistant", content: "flushed response" }),
    );
    expect(onStatus).not.toHaveBeenCalledWith(
      'Agent "repo-a" returned to waiting without assistant output.',
    );
  });

  it("waits for the configured poll interval before polling again", async () => {
    vi.useFakeTimers();
    try {
      const running = makeAgent({ status: AgentStatus.RUNNING });
      const waiting = makeAgent({ status: AgentStatus.WAITING });
      const manager = {
        listAgents: vi
          .fn<() => Promise<AgentInfo[]>>()
          .mockResolvedValueOnce([running])
          .mockResolvedValueOnce([waiting]),
      };
      const adapter = {
        getConversation: vi
          .fn<() => ConversationMessage[]>()
          .mockReturnValue([makeMessage({ role: "assistant", content: "delayed response" })]),
      };

      const promise = waitForAgentResponse({
        manager,
        adapter,
        target: {
          id: "repo-a",
          name: "repo-a",
          type: "claude",
          pid: 10,
          sessionId: "session-1",
          sessionFilePath: "/tmp/session.jsonl",
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

  it("fails after the defensive timeout is reached", async () => {
    const running = makeAgent({ status: AgentStatus.RUNNING });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([running]),
    };
    const adapter = {
      getConversation: vi.fn<() => ConversationMessage[]>().mockReturnValue([]),
    };

    await expect(
      waitForAgentResponse({
        manager,
        adapter,
        target: {
          id: "repo-a",
          name: "repo-a",
          type: "claude",
          pid: 10,
          sessionId: "session-1",
          sessionFilePath: "/tmp/session.jsonl",
        },
        initialMessageCount: 0,
        options: { pollIntervalMs: 0, maxWaitMs: 0 },
        onAssistantMessage: vi.fn(),
      }),
    ).rejects.toThrow('Timed out waiting for agent "repo-a" after 0ms.');
  });

  it("does not sleep past the remaining timeout", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(global, "setTimeout");
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
          id: "repo-a",
          name: "repo-a",
          type: "claude",
          pid: 10,
          sessionId: "session-1",
          sessionFilePath: "/tmp/session.jsonl",
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

  it("uses the configured timeout label in timeout errors", async () => {
    const running = makeAgent({ status: AgentStatus.RUNNING });
    const manager = {
      listAgents: vi.fn<() => Promise<AgentInfo[]>>().mockResolvedValue([running]),
    };
    const adapter = {
      getConversation: vi.fn<() => ConversationMessage[]>().mockReturnValue([]),
    };

    await expect(
      waitForAgentResponse({
        manager,
        adapter,
        target: {
          id: "repo-a",
          name: "repo-a",
          type: "claude",
          pid: 10,
          sessionId: "session-1",
          sessionFilePath: "/tmp/session.jsonl",
        },
        initialMessageCount: 0,
        options: { pollIntervalMs: 0, maxWaitMs: 0, timeoutLabel: "1500ms" },
        onAssistantMessage: vi.fn(),
      }),
    ).rejects.toThrow('Timed out waiting for agent "repo-a" after 1500ms.');
  });
});

describe("sendToAgentGroup", () => {
  const reporter = {
    info: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  };
  const manager: any = {
    listAgents: vi.fn(),
    resolveAgent: vi.fn(),
  };
  const focusManager: any = {
    findTerminal: vi.fn(),
  };
  const writer = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    writer.mockResolvedValue(undefined);
  });

  it("rejects invalid send target option combinations", () => {
    expect(() => assertSendTargetOptions({})).toThrow("Use exactly one of --id or --group.");
    expect(() => assertSendTargetOptions({ id: "api", group: "team" })).toThrow(
      "Use exactly one of --id or --group.",
    );
    expect(() => assertSendTargetOptions({ group: "team", wait: true })).toThrow(
      "Use --wait only with --id; group wait mode is not supported.",
    );
    expect(() => assertSendTargetOptions({ group: "team", json: true })).toThrow(
      "Use --json only with --id --wait; group JSON output is not supported.",
    );
    expect(() => assertSendTargetOptions({ id: "api", wait: true, timeout: "1.5s" })).toThrow(
      "Invalid --timeout. Expected positive integer milliseconds. Example: 30000.",
    );
  });

  it("fails before delivery when group members are missing or ambiguous", async () => {
    const api = { name: "api", status: AgentStatus.WAITING, pid: 10 };
    const workerA = { name: "worker-a", status: AgentStatus.WAITING, pid: 11 };
    const workerB = { name: "worker-b", status: AgentStatus.WAITING, pid: 12 };
    const agents = [api, workerA, workerB];
    manager.listAgents.mockResolvedValue(agents);
    manager.resolveAgent
      .mockReturnValueOnce(api)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce([workerA, workerB]);

    await sendToAgentGroup({
      group: {
        name: "backend-team",
        members: ["api", "missing", "worker"],
        createdAt: "",
        updatedAt: "",
      },
      prompt: "hello",
      manager,
      focusManager,
      writer,
      reporter,
    });

    expect(reporter.error).toHaveBeenCalledWith(
      'Cannot send to group "backend-team" because some members could not be resolved.',
    );
    expect(reporter.error).toHaveBeenCalledWith("  - missing: no running agent matched");
    expect(reporter.error).toHaveBeenCalledWith(
      "  - worker: matched multiple agents (worker-a, worker-b)",
    );
    expect(focusManager.findTerminal).not.toHaveBeenCalled();
    expect(writer).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("deduplicates targets and sends sequentially", async () => {
    const api = { name: "api", status: AgentStatus.WAITING, pid: 10 };
    const worker = { name: "worker", status: AgentStatus.IDLE, pid: 11 };
    const agents = [api, worker];
    const apiLocation = { type: "tmux", identifier: "api" };
    const workerLocation = { type: "tmux", identifier: "worker" };
    manager.listAgents.mockResolvedValue(agents);
    manager.resolveAgent
      .mockReturnValueOnce(api)
      .mockReturnValueOnce(worker)
      .mockReturnValueOnce({ ...api });
    focusManager.findTerminal
      .mockResolvedValueOnce(apiLocation)
      .mockResolvedValueOnce(workerLocation);

    await sendToAgentGroup({
      group: {
        name: "backend-team",
        members: ["api", "worker", "api-alias"],
        createdAt: "",
        updatedAt: "",
      },
      prompt: "status",
      manager,
      focusManager,
      writer,
      reporter,
    });

    expect(reporter.info).toHaveBeenCalledWith(
      'Skipped duplicate target "api" from group member "api-alias".',
    );
    expect(writer).toHaveBeenNthCalledWith(1, apiLocation, "status");
    expect(writer).toHaveBeenNthCalledWith(2, workerLocation, "status");
    expect(reporter.success).toHaveBeenCalledWith(
      'Sent message to 2 agent(s) in group "backend-team".',
    );
  });

  it("continues after one target fails and sets a non-zero exit code", async () => {
    const api = { name: "api", status: AgentStatus.RUNNING, pid: 10 };
    const worker = { name: "worker", status: AgentStatus.WAITING, pid: 11 };
    const apiLocation = { type: "tmux", identifier: "api" };
    const workerLocation = { type: "tmux", identifier: "worker" };
    manager.listAgents.mockResolvedValue([api, worker]);
    manager.resolveAgent.mockReturnValueOnce(api).mockReturnValueOnce(worker);
    focusManager.findTerminal
      .mockResolvedValueOnce(apiLocation)
      .mockResolvedValueOnce(workerLocation);
    writer.mockRejectedValueOnce(new Error("send failed")).mockResolvedValueOnce(undefined);

    await sendToAgentGroup({
      group: { name: "backend-team", members: ["api", "worker"], createdAt: "", updatedAt: "" },
      prompt: "hello",
      manager,
      focusManager,
      writer,
      reporter,
    });

    expect(reporter.warning).toHaveBeenCalledWith(
      'Agent "api" is not waiting for input (status: running). Sending anyway.',
    );
    expect(writer).toHaveBeenCalledTimes(2);
    expect(reporter.error).toHaveBeenCalledWith("Failed to send to api: send failed");
    expect(reporter.success).toHaveBeenCalledWith("Sent message to worker.");
    expect(reporter.error).toHaveBeenCalledWith(
      'Sent message to 1 agent(s), failed for 1 agent(s) in group "backend-team".',
    );
    expect(process.exitCode).toBe(1);
  });
});
