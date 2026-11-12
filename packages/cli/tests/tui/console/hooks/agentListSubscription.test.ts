import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { DaemonEvent } from "@ai-devkit/daemon-client";

type FakeClient = {
  subscribe: (h: (e: DaemonEvent) => void) => Promise<void>;
  close: () => void;
};

let daemonClient: FakeClient | null = null;
let eventHandler: ((e: DaemonEvent) => void) | null = null;

vi.mock("@ai-devkit/daemon-client", () => ({
  ensureDaemon: () => Promise.resolve(daemonClient),
  DaemonClient: { tryConnect: () => Promise.resolve(null) },
}));

import {
  attachDaemonRefresh,
  createWarmupRefresher,
  isAgentStartEvent,
  WARMUP_REFRESH_DELAYS_MS,
} from "../../../../src/tui/console/hooks/agentListSubscription.js";

const evt = (kind: string): DaemonEvent => ({ seq: 1, ts: 0, kind, payload: {} });

describe("attachDaemonRefresh", () => {
  beforeEach(() => {
    daemonClient = null;
    eventHandler = null;
  });

  it("returns null when the daemon is absent — caller keeps polling", async () => {
    const onEvent = vi.fn();
    const onSubscribed = vi.fn();
    const client = await attachDaemonRefresh(onEvent, onSubscribed);
    expect(client).toBeNull();
    expect(onSubscribed).not.toHaveBeenCalled();
  });

  it("subscribes, forwards events to onEvent, and signals onSubscribed", async () => {
    daemonClient = {
      subscribe: (h) => {
        eventHandler = h;
        return Promise.resolve();
      },
      close: vi.fn(),
    };
    const onEvent = vi.fn();
    const onSubscribed = vi.fn();
    const client = await attachDaemonRefresh(onEvent, onSubscribed);
    expect(client).toBe(daemonClient);
    expect(onSubscribed).toHaveBeenCalledOnce();
    eventHandler!(evt("agent.appeared"));
    eventHandler!(evt("agent.disappeared"));
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenNthCalledWith(1, evt("agent.appeared"));
  });

  it("returns null and closes the client when subscribe fails", async () => {
    const close = vi.fn();
    daemonClient = {
      subscribe: () => Promise.reject(new Error("no subscribe")),
      close,
    };
    const onEvent = vi.fn();
    const onSubscribed = vi.fn();
    const client = await attachDaemonRefresh(onEvent, onSubscribed);
    expect(client).toBeNull();
    expect(onSubscribed).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});

describe("isAgentStartEvent", () => {
  it("matches lifecycle start events only", () => {
    expect(isAgentStartEvent(evt("agent.appeared"))).toBe(true);
    expect(isAgentStartEvent(evt("agent.started"))).toBe(true);
    expect(isAgentStartEvent(evt("agent.disappeared"))).toBe(false);
    expect(isAgentStartEvent(evt("agent.list"))).toBe(false);
  });
});

describe("createWarmupRefresher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to +4s, +10s, +25s warm-up delays", () => {
    expect(WARMUP_REFRESH_DELAYS_MS).toEqual([4_000, 10_000, 25_000]);
  });

  it("fires one refresh at each warm-up delay after trigger", () => {
    const refresh = vi.fn();
    const warmup = createWarmupRefresher(refresh);
    warmup.trigger();
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3_999);
    expect(refresh).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6_000);
    expect(refresh).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(15_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(120_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("coalesces overlapping triggers into a single restarted schedule", () => {
    const refresh = vi.fn();
    const warmup = createWarmupRefresher(refresh);
    warmup.trigger();
    vi.advanceTimersByTime(3_000);
    warmup.trigger();
    warmup.trigger();
    vi.advanceTimersByTime(1_000);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("cancel() drops all pending warm-up refreshes", () => {
    const refresh = vi.fn();
    const warmup = createWarmupRefresher(refresh);
    warmup.trigger();
    vi.advanceTimersByTime(4_000);
    warmup.cancel();
    vi.advanceTimersByTime(200_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts custom delays", () => {
    const refresh = vi.fn();
    const warmup = createWarmupRefresher(refresh, [100]);
    warmup.trigger();
    vi.advanceTimersByTime(100);
    expect(refresh).toHaveBeenCalledOnce();
  });
});
