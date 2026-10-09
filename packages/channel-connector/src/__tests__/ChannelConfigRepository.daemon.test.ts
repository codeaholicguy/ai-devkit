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

import { ChannelConfigRepository } from "../ChannelConfigRepository.js";

describe("ChannelConfigRepository daemon client lifecycle", () => {
  beforeEach(() => {
    mocks.request.mockReset().mockResolvedValue({});
    mocks.close.mockReset();
    mocks.ensureDaemon
      .mockReset()
      .mockResolvedValue({ request: mocks.request, close: mocks.close });
  });

  it("closes the daemon client after each registry operation", async () => {
    const repo = new ChannelConfigRepository();
    const entry = {
      type: "telegram",
      enabled: true,
      createdAt: "2026-04-11T00:00:00Z",
      config: { botToken: "t", botUsername: "bot" },
    };

    await repo.getConfig();
    await repo.getChannel("telegram");
    await repo.saveChannel("telegram", entry);
    await repo.removeChannel("telegram");

    expect(mocks.ensureDaemon).toHaveBeenCalledTimes(4);
    expect(mocks.close).toHaveBeenCalledTimes(4);
  });

  it("closes the client when the request fails before file fallback", async () => {
    mocks.request.mockRejectedValue(new Error("daemon gone"));

    const repo = new ChannelConfigRepository();
    await repo.getConfig();

    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});
