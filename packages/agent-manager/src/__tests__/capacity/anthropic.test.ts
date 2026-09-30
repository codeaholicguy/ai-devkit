import { describe, expect, it, vi } from "vitest";
import * as capacity from "../../capacity/index.js";
import * as agentManager from "../../index.js";

const checkedAt = "2026-09-30T12:00:00.000Z";
const freshAuth = JSON.stringify({
  anthropic: {
    type: "oauth",
    access: "fake-pi-anthropic-token",
    refresh: "fake-pi-anthropic-refresh",
    expires: Date.parse("2026-10-01T12:00:00.000Z"),
  },
});

describe("Pi Anthropic capacity", () => {
  it("exports a Pi Anthropic capacity report reader", () => {
    expect(capacity).toHaveProperty("getAnthropicCapacityReport");
    expect(agentManager).toHaveProperty("getAnthropicCapacityReport");
  });

  it("reads Pi's Anthropic OAuth credential and reports the Pi harness", async () => {
    const readFile = vi.fn(async () => freshAuth);
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ five_hour: { utilization: 20 } }), {
          status: 200,
        }),
    );

    const report = await capacity.getAnthropicCapacityReport({
      now: () => new Date(checkedAt),
      env: { HOME: "/users/test" },
      readFile,
      fetch,
    });

    expect(readFile).toHaveBeenCalledWith("/users/test/.pi/agent/auth.json", "utf8");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/api/oauth/usage",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer fake-pi-anthropic-token",
        }),
      }),
    );
    expect(report).toMatchObject({
      harness: "pi",
      provider: "anthropic",
      generatedAt: checkedAt,
      authenticated: true,
      available: "yes",
    });
    expect(JSON.stringify(report)).not.toContain("fake-pi-anthropic-token");
    expect(JSON.stringify(report)).not.toContain("fake-pi-anthropic-refresh");
  });

  it("does not fetch for an expired Pi login and returns a stale report", async () => {
    const fetch = vi.fn();
    const report = await capacity.getAnthropicCapacityReport({
      now: () => new Date(checkedAt),
      env: { HOME: "/users/test" },
      readFile: async () =>
        JSON.stringify({
          anthropic: {
            type: "oauth",
            access: "fake-expired-token",
            expires: 1,
          },
        }),
      fetch,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(report).toEqual({
      harness: "pi",
      provider: "anthropic",
      generatedAt: checkedAt,
      authenticated: true,
      available: "unknown",
      windows: [],
      creditsRemaining: null,
    });
  });

  it.each([
    [
      "missing file",
      async () => Promise.reject(Object.assign(new Error("missing"), { code: "ENOENT" })),
    ],
    ["malformed file", async () => "{"],
    ["missing credential", async () => "{}"],
    ["malformed credential", async () => JSON.stringify({ anthropic: { type: "oauth" } })],
  ])("rejects a %s without fetching", async (_name, readFile) => {
    const fetch = vi.fn();
    await expect(
      capacity.getAnthropicCapacityReport({
        now: () => new Date(checkedAt),
        env: { HOME: "/users/test" },
        readFile,
        fetch,
      }),
    ).rejects.toThrow(/Pi Anthropic/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
