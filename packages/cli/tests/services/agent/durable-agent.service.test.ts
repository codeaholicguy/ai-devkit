import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ ensure: vi.fn() }));
vi.mock("@ai-devkit/daemon-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ai-devkit/daemon-client")>()),
  ensureDaemon: mocks.ensure,
}));
import { DurableAgentService } from "../../../src/services/agent/durable-agent.service.js";
import { DaemonRpcError } from "@ai-devkit/daemon-client";

const agent = {
  id: "one",
  name: "worker",
  provider: "claude",
  providerSessionId: "session",
  lastResult: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DurableAgentService", () => {
  it("creates a durable agent through devkitd and closes the client", async () => {
    const client = {
      durableCapabilities: vi.fn().mockResolvedValue({ version: 1, owner: "devkitd" }),
      createDurable: vi.fn().mockResolvedValue(agent),
      close: vi.fn(),
    };
    mocks.ensure.mockResolvedValue(client);
    expect(
      await new DurableAgentService("claude").create({
        name: "worker",
        cwd: "/repo",
      }),
    ).toEqual(agent);
    expect(client.close).toHaveBeenCalled();
  });

  it("skips durable lookup on reads when daemon is absent or outdated", async () => {
    mocks.ensure.mockResolvedValue(null);
    const service = new DurableAgentService("claude");
    expect(await service.repository.list()).toEqual([]);
    expect(await service.repository.resolve("one")).toBeNull();

    const oldClient = {
      durableCapabilities: vi
        .fn()
        .mockRejectedValue(new DaemonRpcError("unknown method: durable.capabilities")),
      close: vi.fn(),
    };
    mocks.ensure.mockResolvedValue(oldClient);
    expect(await service.repository.list()).toEqual([]);
    expect(await service.repository.resolve("one")).toBeNull();
    expect(oldClient.close).toHaveBeenCalledTimes(2);
  });

  it("requires a running compatible daemon for create and send", async () => {
    mocks.ensure.mockResolvedValue(null);
    await expect(
      new DurableAgentService("claude").create({ name: "worker", cwd: "/repo" }),
    ).rejects.toThrow(/requires? a running devkitd/i);
    await expect(new DurableAgentService("claude").send("one", "prompt")).rejects.toThrow(
      /requires? a running devkitd/i,
    );

    const oldClient = {
      durableCapabilities: vi
        .fn()
        .mockRejectedValue(new DaemonRpcError("unknown method: durable.capabilities")),
      close: vi.fn(),
    };
    mocks.ensure.mockResolvedValue(oldClient);
    await expect(
      new DurableAgentService("claude").create({ name: "worker", cwd: "/repo" }),
    ).rejects.toThrow(/updated devkitd/i);
    expect(oldClient.close).toHaveBeenCalled();
  });

  it("requires supported capability version before mutation", async () => {
    mocks.ensure.mockResolvedValue({
      durableCapabilities: vi.fn().mockResolvedValue({ version: 99 }),
      close: vi.fn(),
    });
    await expect(
      new DurableAgentService("claude").create({ name: "worker", cwd: "/repo" }),
    ).rejects.toThrow(/capability/);
  });

  it("surfaces transport failure without retrying", async () => {
    mocks.ensure.mockResolvedValue({
      durableCapabilities: vi.fn().mockResolvedValue({ version: 1 }),
      createDurable: vi.fn().mockRejectedValue(new Error("socket closed")),
      close: vi.fn(),
    });
    await expect(
      new DurableAgentService("claude").create({ name: "worker", cwd: "/repo" }),
    ).rejects.toThrow("socket closed");
  });

  it("polls the specific run rather than last result", async () => {
    const client = {
      durableCapabilities: vi.fn().mockResolvedValue({ version: 1 }),
      showDurable: vi
        .fn()
        .mockResolvedValueOnce(agent)
        .mockResolvedValueOnce({
          agent,
          run: { token: "run-one", status: "succeeded", summary: "reply", exitCode: 0 },
        }),
      sendDurable: vi.fn().mockResolvedValue({ agent, runId: "run-one" }),
      close: vi.fn(),
    };
    mocks.ensure.mockResolvedValue(client);
    expect((await new DurableAgentService("claude").send("one", "prompt")).result).toBe("reply");
    expect(client.showDurable).toHaveBeenLastCalledWith("one", "run-one");
  });

  for (const [label, resolution, message] of [
    ["missing", null, "was not found"],
    ["ambiguous", [agent, agent], "Multiple durable agents"],
    ["wrong provider", { ...agent, provider: "pi" }, "provider does not match"],
  ] as const) {
    it(`refuses ${label} send target`, async () => {
      const client = {
        durableCapabilities: vi.fn().mockResolvedValue({ version: 1 }),
        showDurable: vi.fn().mockResolvedValue(resolution),
        sendDurable: vi.fn(),
        close: vi.fn(),
      };
      mocks.ensure.mockResolvedValue(client);
      await expect(new DurableAgentService("claude").send("one", "prompt")).rejects.toThrow(
        message,
      );
      expect(client.sendDurable).not.toHaveBeenCalled();
    });
  }

  for (const [label, run, message] of [
    ["missing run", null, "lost the requested"],
    ["failed run", { status: "failed", summary: "provider failed" }, "provider failed"],
    ["invalid exit", { status: "succeeded", exitCode: 1 }, "Invalid daemon durable completion"],
  ] as const) {
    it(`surfaces ${label} without retrying`, async () => {
      const client = {
        durableCapabilities: vi.fn().mockResolvedValue({ version: 1 }),
        showDurable: vi.fn().mockResolvedValueOnce(agent).mockResolvedValueOnce({ agent, run }),
        sendDurable: vi.fn().mockResolvedValue({ agent, runId: "run" }),
        close: vi.fn(),
      };
      mocks.ensure.mockResolvedValue(client);
      await expect(new DurableAgentService("claude").send("one", "prompt")).rejects.toThrow(
        message,
      );
      expect(client.sendDurable).toHaveBeenCalledOnce();
    });
  }

  it("waits for the run, returns its full result, and forwards onDebug", async () => {
    const client = {
      durableCapabilities: vi.fn().mockResolvedValue({ version: 1 }),
      showDurable: vi
        .fn()
        .mockResolvedValueOnce(agent)
        .mockResolvedValueOnce({ agent, run: { status: "running" } })
        .mockResolvedValueOnce({
          agent,
          run: { status: "succeeded", exitCode: 0, result: "full reply", summary: "short" },
        }),
      sendDurable: vi.fn().mockResolvedValue({ agent, runId: "run" }),
      close: vi.fn(),
    };
    mocks.ensure.mockResolvedValue(client);
    expect((await new DurableAgentService("claude").send("one", "prompt")).result).toBe(
      "full reply",
    );
    expect(mocks.ensure).toHaveBeenCalledWith({ onDebug: expect.any(Function) });
  });
});
