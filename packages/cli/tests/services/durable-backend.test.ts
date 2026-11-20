import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ ensure: vi.fn(), exists: vi.fn(), local: vi.fn() }));
vi.mock("@ai-devkit/daemon-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ai-devkit/daemon-client")>()),
  ensureDaemon: mocks.ensure,
}));
vi.mock("node:fs", () => ({ existsSync: mocks.exists }));
import { RoutedDurableService } from "../../src/services/agent/durable-backend.service.js";
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
  mocks.exists.mockReturnValue(false);
  mocks.local.mockReturnValue({
    repository: { list: vi.fn().mockResolvedValue([agent]) },
    create: vi.fn().mockResolvedValue(agent),
    send: vi.fn(),
  });
});
describe("durable authority routing", () => {
  it("uses daemon create without opening local storage", async () => {
    const client = {
      durableCapabilities: vi.fn().mockResolvedValue({ version: 1 }),
      createDurable: vi.fn().mockResolvedValue(agent),
      close: vi.fn(),
    };
    mocks.ensure.mockResolvedValue(client);
    expect(
      await new RoutedDurableService("claude", mocks.local).create({
        name: "worker",
        cwd: "/repo",
      }),
    ).toEqual(agent);
    expect(mocks.local).not.toHaveBeenCalled();
    expect(client.close).toHaveBeenCalled();
  });
  it("allows old-daemon fallback only before transfer", async () => {
    mocks.ensure.mockResolvedValue({
      durableCapabilities: vi
        .fn()
        .mockRejectedValue(new DaemonRpcError("unknown method: durable.capabilities")),
      close: vi.fn(),
    });
    await new RoutedDurableService("claude", mocks.local).create({ name: "worker", cwd: "/repo" });
    expect(mocks.local).toHaveBeenCalledOnce();
    mocks.exists.mockReturnValue(true);
    await expect(new RoutedDurableService("claude", mocks.local).repository.list()).rejects.toThrow(
      /owned by devkitd/,
    );
  });
  it("refuses fallback on outage after transfer", async () => {
    mocks.ensure.mockResolvedValue(null);
    mocks.exists.mockReturnValue(true);
    await expect(new RoutedDurableService("claude", mocks.local).repository.list()).rejects.toThrow(
      /owned by devkitd/,
    );
    expect(mocks.local).not.toHaveBeenCalled();
  });
  it("never retries a possibly executed mutation", async () => {
    mocks.ensure.mockResolvedValue({
      durableCapabilities: vi.fn().mockResolvedValue({ version: 1 }),
      createDurable: vi.fn().mockRejectedValue(new Error("socket closed")),
      close: vi.fn(),
    });
    await expect(
      new RoutedDurableService("claude", mocks.local).create({ name: "worker", cwd: "/repo" }),
    ).rejects.toThrow("socket closed");
    expect(mocks.local).not.toHaveBeenCalled();
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
    expect(
      (await new RoutedDurableService("claude", mocks.local).send("one", "prompt")).result,
    ).toBe("reply");
    expect(client.showDurable).toHaveBeenLastCalledWith("one", "run-one");
  });
});
it("requires truthful capability version before mutation", async () => {
  mocks.ensure.mockResolvedValue({
    durableCapabilities: vi.fn().mockResolvedValue({ version: 99 }),
    close: vi.fn(),
  });
  await expect(
    new RoutedDurableService("claude", mocks.local).create({ name: "worker", cwd: "/repo" }),
  ).rejects.toThrow(/capability/);
  expect(mocks.local).not.toHaveBeenCalled();
});

it("uses local fallback before transfer when no daemon exists", async () => {
  mocks.ensure.mockResolvedValue(null);
  const local = {
    repository: {
      list: vi.fn().mockResolvedValue([agent]),
      resolve: vi.fn().mockResolvedValue(agent),
    },
    send: vi.fn().mockResolvedValue({ result: "local" }),
    create: vi.fn().mockResolvedValue(agent),
  };
  mocks.local.mockReturnValue(local);
  const service = new RoutedDurableService("claude", mocks.local);
  expect(await service.repository.list()).toEqual([agent]);
  expect(await service.repository.resolve("one")).toEqual(agent);
  expect(await service.send("one", "prompt")).toEqual({ result: "local" });
});
it("surfaces migration capability failures without local fallback", async () => {
  mocks.ensure.mockResolvedValue({
    durableCapabilities: vi
      .fn()
      .mockRejectedValue(new DaemonRpcError("migration failed", "migration_failed")),
    close: vi.fn(),
  });
  await expect(new RoutedDurableService("claude", mocks.local).repository.list()).rejects.toThrow(
    "migration failed",
  );
  expect(mocks.local).not.toHaveBeenCalled();
});
for (const [label, resolution, message] of [
  ["missing", null, "was not found"],
  ["ambiguous", [agent, agent], "Multiple durable agents"],
  ["wrong provider", { ...agent, provider: "pi" }, "provider does not match"],
] as const)
  it(`refuses ${label} send target`, async () => {
    const client = {
      durableCapabilities: vi.fn().mockResolvedValue({ version: 1 }),
      showDurable: vi.fn().mockResolvedValue(resolution),
      sendDurable: vi.fn(),
      close: vi.fn(),
    };
    mocks.ensure.mockResolvedValue(client);
    await expect(
      new RoutedDurableService("claude", mocks.local).send("one", "prompt"),
    ).rejects.toThrow(message);
    expect(client.sendDurable).not.toHaveBeenCalled();
    expect(mocks.local).not.toHaveBeenCalled();
  });
for (const [label, run, message] of [
  ["missing run", null, "lost the requested"],
  ["failed run", { status: "failed", summary: "provider failed" }, "provider failed"],
  ["invalid exit", { status: "succeeded", exitCode: 1 }, "Invalid daemon durable completion"],
] as const)
  it(`surfaces ${label} without retrying`, async () => {
    const client = {
      durableCapabilities: vi.fn().mockResolvedValue({ version: 1 }),
      showDurable: vi.fn().mockResolvedValueOnce(agent).mockResolvedValueOnce({ agent, run }),
      sendDurable: vi.fn().mockResolvedValue({ agent, runId: "run" }),
      close: vi.fn(),
    };
    mocks.ensure.mockResolvedValue(client);
    await expect(
      new RoutedDurableService("claude", mocks.local).send("one", "prompt"),
    ).rejects.toThrow(message);
    expect(mocks.local).not.toHaveBeenCalled();
    expect(client.sendDurable).toHaveBeenCalledOnce();
  });
it("waits for the run and returns its full result", async () => {
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
  expect((await new RoutedDurableService("claude", mocks.local).send("one", "prompt")).result).toBe(
    "full reply",
  );
  expect(mocks.ensure).toHaveBeenCalledWith({ onDebug: expect.any(Function) });
});
