import { AgentStatus, type AgentInfo } from "@ai-devkit/agent-manager";
import {
  AGENT_WAIT_RECHECK_MS,
  AGENT_WAIT_SETTLE_MS,
  agentWaitKey,
  diffAgentChanges,
  parseWaitUntil,
  waitForAgentChanges,
  type AgentWaitSource,
} from "../../../src/services/agent/agent-wait.service.js";

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    name: "repo-a",
    type: "claude",
    status: AgentStatus.RUNNING,
    summary: "Working",
    pid: 10,
    projectPath: "/repo",
    sessionId: "session-1",
    lastActive: new Date("2026-05-14T00:00:00.000Z"),
    ...overrides,
  };
}

function seen(...agents: AgentInfo[]): Map<string, AgentInfo> {
  return new Map(agents.map((agent) => [agentWaitKey(agent), agent]));
}

/** Source whose list() returns the scripted snapshot and whose wake() fires the subscriber. */
function makeSource(initial: AgentInfo[]) {
  let snapshot = initial;
  let onWake: (() => void) | null = null;
  const source: AgentWaitSource & { set(next: AgentInfo[]): void; wake(): void } = {
    list: vi.fn(async () => snapshot),
    subscribe: vi.fn(async (handler: () => void) => {
      onWake = handler;
    }),
    close: vi.fn(),
    set(next) {
      snapshot = next;
    },
    wake() {
      onWake?.();
    },
  };
  return source;
}

describe("parseWaitUntil", () => {
  it("defaults to waiting, idle and exited", () => {
    expect(parseWaitUntil(undefined)).toEqual(["waiting", "idle", "exited"]);
  });

  it("accepts comma lists with spaces and mixed case", () => {
    expect(parseWaitUntil(" Waiting, appeared ")).toEqual(["waiting", "appeared"]);
  });

  it("rejects unknown conditions with the allowed values", () => {
    expect(() => parseWaitUntil("waiting,running")).toThrow(
      'Invalid --until value "running". Allowed: waiting, idle, exited, appeared.',
    );
  });

  it("rejects an empty list", () => {
    expect(() => parseWaitUntil(" , ")).toThrow("--until requires at least one condition");
  });
});

describe("diffAgentChanges", () => {
  const until = new Set(parseWaitUntil(undefined));

  it("reports a transition into a target status", () => {
    const prev = seen(makeAgent());
    const changes = diffAgentChanges(prev, [makeAgent({ status: AgentStatus.WAITING })], until, {
      includeAppeared: false,
    });
    expect(changes).toEqual([
      { name: "repo-a", type: "claude", pid: 10, from: "running", to: "waiting" },
    ]);
  });

  it("ignores unchanged statuses, including ones already in a target state", () => {
    const prev = seen(makeAgent(), makeAgent({ pid: 11, status: AgentStatus.WAITING }));
    const current = [makeAgent(), makeAgent({ pid: 11, status: AgentStatus.WAITING })];
    expect(diffAgentChanges(prev, current, until, { includeAppeared: false })).toEqual([]);
  });

  it("ignores transitions into statuses outside --until", () => {
    const prev = seen(makeAgent({ status: AgentStatus.WAITING }));
    const current = [makeAgent({ status: AgentStatus.IDLE })];
    expect(
      diffAgentChanges(prev, current, new Set(["waiting" as const]), { includeAppeared: false }),
    ).toEqual([]);
  });

  it("reports exited only when requested", () => {
    const prev = seen(makeAgent());
    expect(diffAgentChanges(prev, [], until, { includeAppeared: false })).toEqual([
      { name: "repo-a", type: "claude", pid: 10, from: "running", to: "exited" },
    ]);
    expect(
      diffAgentChanges(prev, [], new Set(["waiting" as const]), { includeAppeared: false }),
    ).toEqual([]);
  });

  it("reports appeared only for unfiltered waits that ask for it", () => {
    const appearedUntil = new Set(parseWaitUntil("appeared"));
    const current = [makeAgent({ pid: 12, name: "new" })];
    expect(diffAgentChanges(seen(), current, appearedUntil, { includeAppeared: true })).toEqual([
      { name: "new", type: "claude", pid: 12, from: null, to: "appeared" },
    ]);
    expect(diffAgentChanges(seen(), current, appearedUntil, { includeAppeared: false })).toEqual(
      [],
    );
  });
});

describe("waitForAgentChanges", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const until = parseWaitUntil(undefined);

  it("returns triggered after a wake reveals a transition and the settle window passes", async () => {
    const source = makeSource([makeAgent()]);
    const result = waitForAgentChanges({ source, until, timeoutMs: 60_000 });
    await vi.advanceTimersByTimeAsync(0);

    source.set([makeAgent({ status: AgentStatus.WAITING })]);
    source.wake();
    await vi.advanceTimersByTimeAsync(AGENT_WAIT_SETTLE_MS);

    await expect(result).resolves.toMatchObject({
      reason: "triggered",
      changes: [{ name: "repo-a", from: "running", to: "waiting" }],
    });
    expect(source.close).toHaveBeenCalledTimes(1);
  });

  it("subscribes before taking the baseline", async () => {
    const source = makeSource([makeAgent()]);
    const order: string[] = [];
    (source.subscribe as any).mockImplementation(async () => {
      order.push("subscribe");
    });
    (source.list as any).mockImplementation(async () => {
      order.push("list");
      return [makeAgent()];
    });
    const result = waitForAgentChanges({ source, until, timeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    expect(order.slice(0, 2)).toEqual(["subscribe", "list"]);
  });

  it("merges changes inside the settle window, keeping the first from and latest to", async () => {
    const other = makeAgent({ pid: 11, name: "repo-b" });
    const source = makeSource([makeAgent(), other]);
    const result = waitForAgentChanges({ source, until, timeoutMs: 60_000 });
    await vi.advanceTimersByTimeAsync(0);

    source.set([makeAgent({ status: AgentStatus.WAITING }), other]);
    source.wake();
    await vi.advanceTimersByTimeAsync(AGENT_WAIT_SETTLE_MS / 2);

    source.set([makeAgent({ status: AgentStatus.IDLE })]);
    source.wake();
    await vi.advanceTimersByTimeAsync(AGENT_WAIT_SETTLE_MS);

    const { changes } = await result;
    expect(changes).toEqual([
      { name: "repo-a", type: "claude", pid: 10, from: "running", to: "idle" },
      { name: "repo-b", type: "claude", pid: 11, from: "running", to: "exited" },
    ]);
  });

  it("never settles past the deadline", async () => {
    const source = makeSource([makeAgent()]);
    const result = waitForAgentChanges({ source, until, timeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(900);

    source.set([makeAgent({ status: AgentStatus.WAITING })]);
    source.wake();
    await vi.advanceTimersByTimeAsync(100);

    const outcome = await result;
    expect(outcome.reason).toBe("triggered");
    expect(outcome.elapsedMs).toBeLessThanOrEqual(1_000);
  });

  it("returns timeout with no changes at the deadline", async () => {
    const source = makeSource([makeAgent({ status: AgentStatus.WAITING })]);
    const result = waitForAgentChanges({ source, until, timeoutMs: 5_000 });
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(result).resolves.toEqual({ reason: "timeout", elapsedMs: 5_000, changes: [] });
    expect(source.close).toHaveBeenCalledTimes(1);
  });

  it("re-checks on a fixed interval without any events", async () => {
    const source = makeSource([makeAgent()]);
    const result = waitForAgentChanges({ source, until, timeoutMs: 600_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(source.list).toHaveBeenCalledTimes(1);

    source.set([makeAgent({ status: AgentStatus.WAITING })]);
    await vi.advanceTimersByTimeAsync(AGENT_WAIT_RECHECK_MS);
    expect(source.list).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(AGENT_WAIT_SETTLE_MS);

    await expect(result).resolves.toMatchObject({ reason: "triggered" });
  });

  it("coalesces wakes that arrive during a check into one follow-up check", async () => {
    const source = makeSource([makeAgent()]);
    let releaseList: (() => void) | null = null;
    const result = waitForAgentChanges({ source, until, timeoutMs: 10_000 });
    await vi.advanceTimersByTimeAsync(0);

    (source.list as any).mockImplementationOnce(
      () =>
        new Promise<AgentInfo[]>((resolve) => {
          releaseList = () => resolve([makeAgent()]);
        }),
    );
    source.wake();
    await vi.advanceTimersByTimeAsync(0);
    source.wake();
    source.wake();
    releaseList!();
    await vi.advanceTimersByTimeAsync(0);

    expect(source.list).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
  });

  it("only watches the given agents", async () => {
    const watched = makeAgent();
    const source = makeSource([watched, makeAgent({ pid: 11, name: "repo-b" })]);
    const result = waitForAgentChanges({
      source,
      until,
      timeoutMs: 1_000,
      watch: new Set([agentWaitKey(watched)]),
    });
    await vi.advanceTimersByTimeAsync(0);

    source.set([watched, makeAgent({ pid: 11, name: "repo-b", status: AgentStatus.WAITING })]);
    source.wake();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toMatchObject({ reason: "timeout", changes: [] });
  });

  it("closes the source when listing fails", async () => {
    const source = makeSource([]);
    (source.list as any).mockRejectedValueOnce(new Error("boom"));
    await expect(waitForAgentChanges({ source, until, timeoutMs: 1_000 })).rejects.toThrow("boom");
    expect(source.close).toHaveBeenCalledTimes(1);
  });
});
