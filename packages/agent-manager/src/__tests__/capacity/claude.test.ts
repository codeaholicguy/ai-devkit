import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import * as capacity from "../../capacity/index.js";
import { parseClaudeUsage } from "../../capacity/claude.js";
import * as agentManager from "../../index.js";

const fixture = (name: string) =>
  readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("Claude capacity", () => {
  it("exposes a Claude capacity report reader", () => {
    expect(capacity).toHaveProperty("getClaudeCapacityReport");
  });

  it("exports the Claude report reader from agent-manager", () => {
    expect(agentManager).toHaveProperty("getClaudeCapacityReport");
  });

  it("uses an environment OAuth token for the exact usage request", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ five_hour: { utilization: 20 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const report = await capacity.getClaudeCapacityReport({
      now: () => new Date("2026-09-25T18:00:00.000Z"),
      env: { CLAUDE_CODE_OAUTH_TOKEN: "fake-environment-token" },
      readFile: vi.fn(),
      fetch,
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/api/oauth/usage",
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer fake-environment-token",
          "Content-Type": "application/json",
          "User-Agent": "claude-code/2.1.0",
          "anthropic-beta": "oauth-2025-04-20",
        },
      }),
    );
    expect(report).toMatchObject({
      harness: "claude",
      provider: "anthropic",
      authenticated: true,
    });
  });

  it("reads the OAuth token from the active Claude profile", async () => {
    const readFile = vi.fn(async () => fixture("claude-credentials.json"));
    const fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));

    await capacity.getClaudeCapacityReport({
      now: () => new Date("2026-09-25T18:00:00.000Z"),
      env: { HOME: "/users/test", CLAUDE_CONFIG_DIR: "profiles/work" },
      cwd: "/workspace/project",
      readFile,
      fetch,
    });

    expect(readFile).toHaveBeenCalledWith(
      "/workspace/project/profiles/work/.credentials.json",
      "utf8",
    );
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer fake-claude-oauth-token-for-tests",
    });
  });

  it("rejects an expired profile credential before fetching usage", async () => {
    const fetch = vi.fn();
    await expect(
      capacity.getClaudeCapacityReport({
        now: () => new Date("2026-09-25T18:00:00.000Z"),
        env: { HOME: "/users/test" },
        platform: "linux",
        readFile: async () =>
          JSON.stringify({
            claudeAiOauth: {
              accessToken: "fake-expired-token",
              expiresAt: 1,
            },
          }),
        fetch,
      }),
    ).rejects.toThrow("Claude OAuth credentials expired");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps subscription, model, scoped, and extra-usage windows", async () => {
    const report = await capacity.getClaudeCapacityReport({
      now: () => new Date("2026-09-25T18:00:00.000Z"),
      env: { CLAUDE_CODE_OAUTH_TOKEN: "fake-mapping-token" },
      fetch: vi.fn(async () => new Response(await fixture("claude-usage.json"), { status: 200 })),
    });

    expect(report).toMatchObject({
      harness: "claude",
      provider: "anthropic",
      generatedAt: "2026-09-25T18:00:00.000Z",
      authenticated: true,
      available: "yes",
      creditsRemaining: null,
    });
    expect(report.windows).toEqual([
      {
        id: "session",
        label: "Session",
        durationMinutes: 300,
        usedPercent: 25,
        resetsAt: "2026-09-25T20:00:00.000Z",
      },
      {
        id: "weekly",
        label: "Weekly",
        durationMinutes: 10080,
        usedPercent: 55.5,
        resetsAt: "2026-09-30T12:00:00.000Z",
      },
      {
        id: "claude:sonnet:weekly",
        label: "Sonnet weekly",
        durationMinutes: 10080,
        usedPercent: 61,
        resetsAt: "2026-09-30T12:00:00.000Z",
      },
      {
        id: "claude:opus:weekly",
        label: "Opus weekly",
        durationMinutes: 10080,
        usedPercent: 72,
        resetsAt: "2026-09-30T12:00:00.000Z",
      },
      {
        id: "claude:weekly:claude-fable",
        label: "Fable weekly",
        durationMinutes: 10080,
        usedPercent: 33,
        resetsAt: "2026-09-29T08:00:00.000Z",
      },
      {
        id: "claude:extra-usage",
        label: "Extra usage · USD",
        limitType: "CREDIT_LIMIT",
        durationMinutes: null,
        usedPercent: 25,
        resetsAt: null,
        total: 50,
        current: 12.5,
        remaining: 37.5,
      },
    ]);
  });

  it("reports a rejected OAuth token as unauthorized without leaking it", async () => {
    const token = "fake-rejected-token-never-expose";
    let error: unknown;
    try {
      await capacity.getClaudeCapacityReport({
        env: { CLAUDE_CODE_OAUTH_TOKEN: token },
        fetch: vi.fn(async () => new Response('{"private":"response-body"}', { status: 401 })),
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Claude OAuth request unauthorized (HTTP 401)");
    expect((error as Error).message).not.toContain(token);
    expect((error as Error).message).not.toContain("response-body");
  });

  it("reports forbidden subscription usage without returning the response body", async () => {
    await expect(
      capacity.getClaudeCapacityReport({
        env: { CLAUDE_CODE_OAUTH_TOKEN: "fake-forbidden-token" },
        fetch: vi.fn(async () => new Response("private forbidden details", { status: 403 })),
      }),
    ).rejects.toThrow("Claude OAuth request forbidden (HTTP 403)");
  });

  it.each([
    ["120", "2026-09-25T18:02:00.000Z"],
    ["Fri, 25 Sep 2026 19:00:00 GMT", "2026-09-25T19:00:00.000Z"],
  ])("honors Retry-After %s", async (retryAfter, expected) => {
    await expect(
      capacity.getClaudeCapacityReport({
        now: () => new Date("2026-09-25T18:00:00.000Z"),
        env: { CLAUDE_CODE_OAUTH_TOKEN: "fake-rate-limited-token" },
        fetch: vi.fn(
          async () =>
            new Response("private rate-limit body", {
              status: 429,
              headers: { "Retry-After": retryAfter },
            }),
        ),
      }),
    ).rejects.toThrow(`Claude OAuth usage rate limited until ${expected}`);
  });

  it("sanitizes malformed usage JSON", async () => {
    await expect(
      capacity.getClaudeCapacityReport({
        env: { CLAUDE_CODE_OAUTH_TOKEN: "fake-malformed-token" },
        fetch: vi.fn(async () => new Response("private non-json response", { status: 200 })),
      }),
    ).rejects.toThrow("Claude usage response is malformed");
  });

  it("sanitizes network failures", async () => {
    await expect(
      capacity.getClaudeCapacityReport({
        env: { CLAUDE_CODE_OAUTH_TOKEN: "fake-network-token" },
        fetch: vi.fn(async () => {
          throw new Error("private network details fake-network-token");
        }),
      }),
    ).rejects.toThrow("Claude OAuth usage request failed");
  });

  it("preserves valid windows in a partial payload", async () => {
    const report = parseClaudeUsage(
      JSON.parse(await fixture("claude-usage-partial.json")),
      "2026-09-25T18:00:00.000Z",
    );
    expect(report.available).toBe("yes");
    expect(report.windows).toEqual([
      {
        id: "session",
        label: "Session",
        durationMinutes: 300,
        usedPercent: 10,
        resetsAt: null,
      },
      {
        id: "weekly",
        label: "Weekly",
        durationMinutes: 10080,
        usedPercent: null,
        resetsAt: null,
      },
    ]);
  });

  it("rejects a non-object usage payload", async () => {
    const raw = JSON.parse(await fixture("claude-usage-malformed.json"));
    expect(() => parseClaudeUsage(raw, "2026-09-25T18:00:00.000Z")).toThrow(
      "Claude usage response is malformed",
    );
  });

  it.each([
    ["missing file", async () => Promise.reject(new Error("missing"))],
    ["malformed file", async () => "{"],
    ["missing token", async () => JSON.stringify({ claudeAiOauth: {} })],
  ])("rejects %s credentials without fetching", async (_name, readFile) => {
    const fetch = vi.fn();
    await expect(
      capacity.getClaudeCapacityReport({
        env: { HOME: "/users/test" },
        platform: "linux",
        readFile,
        fetch,
      }),
    ).rejects.toThrow("Claude OAuth credentials not found or malformed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the default Claude profile under HOME", async () => {
    const readFile = vi.fn(async () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "fake-home-token" } }),
    );
    await capacity.getClaudeCapacityReport({
      env: { HOME: "/users/test" },
      readFile,
      fetch: vi.fn(async () => new Response("{}", { status: 200 })),
    });
    expect(readFile).toHaveBeenCalledWith("/users/test/.claude/.credentials.json", "utf8");
  });

  it("falls back to the Claude Code Keychain credential on macOS", async () => {
    const keychainRead = vi.fn(async () =>
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "fake-keychain-token",
          expiresAt: 1_900_000_000_000,
        },
      }),
    );
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));

    await capacity.getClaudeCapacityReport({
      now: () => new Date("2026-09-25T18:00:00.000Z"),
      env: { HOME: "/users/test" },
      platform: "darwin",
      readFile: async () => Promise.reject(new Error("missing")),
      keychainRead,
      fetch,
    });

    expect(keychainRead).toHaveBeenCalledWith("Claude Code-credentials");
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer fake-keychain-token",
    });
  });

  it("falls back to Keychain when the default profile file has no OAuth token", async () => {
    const keychainRead = vi.fn(async () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "fake-keychain-fallback-token" } }),
    );
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));

    await capacity.getClaudeCapacityReport({
      env: { HOME: "/users/test" },
      platform: "darwin",
      readFile: async () => JSON.stringify({}),
      keychainRead,
      fetch,
    });

    expect(keychainRead).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer fake-keychain-fallback-token",
    });
  });

  it("keeps environment and profile-file credentials ahead of Keychain", async () => {
    const keychainRead = vi.fn();
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));

    await capacity.getClaudeCapacityReport({
      env: { CLAUDE_CODE_OAUTH_TOKEN: "fake-preferred-environment-token" },
      platform: "darwin",
      keychainRead,
      fetch,
    });
    await capacity.getClaudeCapacityReport({
      env: { HOME: "/users/test" },
      platform: "darwin",
      readFile: async () =>
        JSON.stringify({ claudeAiOauth: { accessToken: "fake-preferred-file-token" } }),
      keychainRead,
      fetch,
    });

    expect(keychainRead).not.toHaveBeenCalled();
  });

  it("rejects expired Keychain credentials before fetching usage", async () => {
    const fetch = vi.fn();

    await expect(
      capacity.getClaudeCapacityReport({
        now: () => new Date("2026-09-25T18:00:00.000Z"),
        env: { HOME: "/users/test" },
        platform: "darwin",
        readFile: async () => Promise.reject(new Error("missing")),
        keychainRead: async () =>
          JSON.stringify({
            claudeAiOauth: { accessToken: "fake-expired-keychain-token", expiresAt: 1 },
          }),
        fetch,
      }),
    ).rejects.toThrow("Claude OAuth credentials expired");

    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses a fresh Keychain credential when the default profile file is expired", async () => {
    const keychainRead = vi.fn(async () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "fake-fresh-keychain-token" } }),
    );
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));

    await capacity.getClaudeCapacityReport({
      now: () => new Date("2026-09-25T18:00:00.000Z"),
      env: { HOME: "/users/test" },
      platform: "darwin",
      readFile: async () =>
        JSON.stringify({
          claudeAiOauth: { accessToken: "fake-expired-file-token", expiresAt: 1 },
        }),
      keychainRead,
      fetch,
    });

    expect(keychainRead).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer fake-fresh-keychain-token",
    });
  });

  it("sanitizes unavailable or malformed Keychain credentials", async () => {
    const fetch = vi.fn();

    await expect(
      capacity.getClaudeCapacityReport({
        env: { HOME: "/users/test" },
        platform: "darwin",
        readFile: async () => Promise.reject(new Error("private file error")),
        keychainRead: async () => "private malformed keychain payload",
        fetch,
      }),
    ).rejects.toThrow("Claude OAuth credentials not found or malformed");

    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not mix the default Keychain credential into a custom Claude profile", async () => {
    const keychainRead = vi.fn(async () =>
      JSON.stringify({ claudeAiOauth: { accessToken: "fake-wrong-profile-token" } }),
    );
    const fetch = vi.fn();

    await expect(
      capacity.getClaudeCapacityReport({
        env: { HOME: "/users/test", CLAUDE_CONFIG_DIR: "/profiles/work" },
        platform: "darwin",
        readFile: async () => Promise.reject(new Error("missing")),
        keychainRead,
        fetch,
      }),
    ).rejects.toThrow("Claude OAuth credentials not found or malformed");

    expect(keychainRead).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports other HTTP failures by status only", async () => {
    await expect(
      capacity.getClaudeCapacityReport({
        env: { CLAUDE_CODE_OAUTH_TOKEN: "fake-status-token" },
        fetch: vi.fn(async () => new Response("private service details", { status: 503 })),
      }),
    ).rejects.toThrow("Claude OAuth usage request failed (HTTP 503)");
  });

  it("aborts a usage request at the configured timeout", async () => {
    vi.useFakeTimers();
    try {
      const request = capacity.getClaudeCapacityReport({
        env: { CLAUDE_CODE_OAUTH_TOKEN: "fake-timeout-token" },
        timeoutMs: 10,
        fetch: vi.fn(
          async (_url, init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () =>
                reject(new Error("private abort details")),
              );
            }),
        ),
      });
      const rejection = expect(request).rejects.toThrow("Claude OAuth usage request failed");
      await vi.advanceTimersByTimeAsync(10);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
