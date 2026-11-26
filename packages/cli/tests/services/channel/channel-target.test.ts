import { vi } from "vitest";
import { resolveDaemonChannelTarget } from "../../../src/services/channel/channel-target.js";

const registration = {
  name: "agent",
  type: "claude",
  pid: 4321,
  cwd: "/repo",
  alive: true,
  pinned: false,
  runtime: "tmux",
  runtimeRef: { session: "session" },
  terminalTarget: { type: "tmux" as const, identifier: "%3", tty: "/dev/pts/3" },
};

it("starts before the list cache catches up and later reads metadata for the registered PID", async () => {
  const daemon = {
    request: vi.fn().mockResolvedValue({ agentLookupTerminal: true }),
    lookupAgent: vi.fn().mockResolvedValue(registration),
    listAgents: vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { name: "agent", pid: 999, sessionId: "wrong" },
        { name: "other", pid: 4321, sessionId: "right", sessionFilePath: "/right.jsonl" },
      ]),
    close: vi.fn(),
  };
  const target = await resolveDaemonChannelTarget(
    "agent",
    vi.fn(),
    async () => daemon,
    async () => daemon,
  );
  expect(target).toMatchObject({
    kind: "resolved",
    agent: { name: "agent", pid: 4321 },
    terminal: { type: "tmux", identifier: "%3" },
  });
  if (target.kind !== "resolved") throw new Error("Expected a resolved target");
  expect(await target.refreshSession?.()).toEqual({
    sessionId: "right",
    sessionFilePath: "/right.jsonl",
  });
  expect(daemon.close).toHaveBeenCalled();
});

it("keeps old or absent daemons on the existing resolution path", async () => {
  const daemon = {
    request: vi.fn().mockResolvedValue({}),
    lookupAgent: vi.fn(),
    listAgents: vi.fn(),
    close: vi.fn(),
  };
  await expect(resolveDaemonChannelTarget("agent", vi.fn(), async () => daemon)).resolves.toEqual({
    kind: "fallback",
  });
  await expect(resolveDaemonChannelTarget("agent", vi.fn(), async () => null)).resolves.toEqual({
    kind: "fallback",
  });
  expect(daemon.lookupAgent).not.toHaveBeenCalled();
  expect(daemon.close).toHaveBeenCalledOnce();
});
