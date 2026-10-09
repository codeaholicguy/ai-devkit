import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureDaemon: vi.fn(),
  request: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@ai-devkit/daemon-client", () => ({
  ensureDaemon: mocks.ensureDaemon,
  DaemonClient: class {},
  daemonSocketPath: () => "/tmp/daemon.sock",
}));

import { ChannelService } from "../../../services/channel/channel.service.js";

const bridge = {
  channelName: "personal",
  channelType: "telegram",
  agentName: "codex-main",
  agentPid: 100,
  bridgePid: 200,
  startedAt: "2026-05-23T00:00:00.000Z",
};

describe("ChannelService daemon path", () => {
  beforeEach(() => {
    mocks.request.mockReset().mockResolvedValue({});
    mocks.close.mockReset();
    mocks.ensureDaemon
      .mockReset()
      .mockResolvedValue({ request: mocks.request, close: mocks.close });
  });

  it("registers and unregisters bridges through the daemon registry", async () => {
    const service = new ChannelService(undefined, () => true);

    await service.registerBridge(bridge);
    await service.unregisterBridge("personal");

    expect(mocks.request).toHaveBeenCalledWith("registry.put", {
      scope: "channel-bridges",
      name: "personal",
      value: bridge,
    });
    expect(mocks.request).toHaveBeenCalledWith("registry.delete", {
      scope: "channel-bridges",
      name: "personal",
    });
    expect(mocks.close).toHaveBeenCalledTimes(2);
  });

  it("lists live bridges from the daemon registry and prunes dead ones on unregister", async () => {
    mocks.request.mockImplementation((method: string) => {
      if (method === "registry.get") {
        return Promise.resolve({
          personal: bridge,
          stale: { ...bridge, channelName: "stale", bridgePid: 999 },
        });
      }
      return Promise.resolve({});
    });
    const service = new ChannelService(undefined, (pid) => pid === 200);

    const live = await service.getLiveBridges();
    expect(live).toEqual([expect.objectContaining({ channelName: "personal" })]);

    await service.unregisterBridge("personal");
    expect(mocks.request).toHaveBeenCalledWith("registry.delete", {
      scope: "channel-bridges",
      name: "stale",
    });
  });

  it("closes the client and falls back to the file registry on daemon failure", async () => {
    mocks.request.mockRejectedValue(new Error("daemon gone"));
    const service = new ChannelService(undefined, () => true);

    // getLiveBridges is read-only: daemon failure must not throw or write.
    await expect(service.getLiveBridges()).resolves.toEqual(expect.any(Array));
    expect(mocks.close).toHaveBeenCalled();
  });
});
