import { describe, expect, it, vi, beforeEach } from "vitest";
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

import { attachDaemonRefresh } from "../../../../tui/console/hooks/agentListSubscription.js";

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
