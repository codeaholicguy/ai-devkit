import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { probeOpenAiCapacity } from "../../capacity/sources/pi.js";
import {
  buildOpenAiPlatformCapacity,
  parseOpenAiUsage,
} from "../../capacity/providers/openai-platform.js";
import { resolvePiOpenAiCredential as resolveOpenAiCredential } from "../../harnesses/pi/credentials.js";

const checkedAt = "2026-09-26T10:00:00.000Z";
const fixtureOauthAccess = "sample access value for tests";
const fakeJwt = (payload: string) =>
  ["test", Buffer.from(payload).toString("base64url"), "test"].join(".");
const fixture = (name: string) =>
  readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
const fixtureString = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("OpenAI credential resolution", () => {
  it("prefers OPENAI_API_KEY without reading Pi auth", async () => {
    const readAuth = vi.fn(async () => fixture("openai-auth.json"));
    await expect(
      resolveOpenAiCredential({
        env: { OPENAI_API_KEY: "env-openai-test-key" },
        readFile: readAuth,
      }),
    ).resolves.toEqual({ kind: "platform", key: "env-openai-test-key" });
    expect(readAuth).not.toHaveBeenCalled();
  });

  it("reads the Pi openai api_key credential from ~/.pi/agent/auth.json", async () => {
    const readAuth = vi.fn(async () => fixture("openai-auth.json"));
    await expect(
      resolveOpenAiCredential({ env: { HOME: "/users/test" }, readFile: readAuth }),
    ).resolves.toEqual({ kind: "platform", key: "pi-openai-test-key" });
    expect(readAuth).toHaveBeenCalledWith("/users/test/.pi/agent/auth.json", "utf8");
  });

  it.each([
    [
      "missing",
      async () => Promise.reject(Object.assign(new Error("missing"), { code: "ENOENT" })),
    ],
    ["invalid JSON", async () => "{"],
    ["wrong credential type", async () => JSON.stringify({ openai: { type: "oauth", key: "x" } })],
    ["missing key", async () => JSON.stringify({ openai: { type: "api_key" } })],
  ])("fails clearly for %s credentials without exposing file content", async (_name, readAuth) => {
    await expect(
      resolveOpenAiCredential({
        env: { HOME: "/users/test" },
        readFile: readAuth,
      }),
    ).rejects.toThrow(/OpenAI credentials not found|OpenAI Pi auth file/);
  });
});

describe("OpenAI tiered credential resolution", () => {
  const oauthFixture = () => fixture("openai-codex-auth.json");
  const bothCredentials = JSON.stringify({
    openai: { type: "api_key", key: "pi-openai-test-key" },
    "openai-codex": {
      type: "oauth",
      access: fixtureOauthAccess,
      refresh: "fixture-refresh-token",
      expires: 1793000000000,
      accountId: "fixture-chatgpt-account-id",
    },
  });

  it("prefers the Pi openai platform credential over the openai-codex OAuth login", async () => {
    await expect(
      resolveOpenAiCredential({
        env: { HOME: "/users/test" },
        readFile: async () => bothCredentials,
      }),
    ).resolves.toEqual({ kind: "platform", key: "pi-openai-test-key" });
  });

  it("resolves the Pi openai-codex OAuth login when no platform credential exists", async () => {
    await expect(
      resolveOpenAiCredential({
        env: { HOME: "/users/test" },
        readFile: async () => oauthFixture(),
      }),
    ).resolves.toEqual({
      kind: "oauth",
      access: fixtureOauthAccess,
      accountId: "fixture-chatgpt-account-id",
      expiresMs: 1793000000000,
    });
  });

  it("normalizes second-based expires values to epoch milliseconds", async () => {
    const auth = JSON.stringify({
      "openai-codex": {
        type: "oauth",
        access: "fixture-access",
        refresh: "fixture-refresh",
        expires: 1793000000,
        accountId: "fixture-chatgpt-account-id",
      },
    });
    await expect(
      resolveOpenAiCredential({ env: { HOME: "/users/test" }, readFile: async () => auth }),
    ).resolves.toMatchObject({ kind: "oauth", expiresMs: 1793000000000 });
  });

  it("keeps a null expiry for OAuth logins without usable expires metadata", async () => {
    const auth = JSON.stringify({
      "openai-codex": {
        type: "oauth",
        access: "fixture-access",
        accountId: "fixture-chatgpt-account-id",
      },
    });
    await expect(
      resolveOpenAiCredential({ env: { HOME: "/users/test" }, readFile: async () => auth }),
    ).resolves.toMatchObject({ kind: "oauth", expiresMs: null });
  });

  it.each([
    ["wrong credential type", JSON.stringify({ "openai-codex": { type: "api_key", key: "x" } })],
    ["missing access token", JSON.stringify({ "openai-codex": { type: "oauth", accountId: "a" } })],
    ["missing account id", JSON.stringify({ "openai-codex": { type: "oauth", access: "t" } })],
  ])(
    "skips a malformed openai-codex credential (%s) with a sanitized error",
    async (_name, auth) => {
      await expect(
        resolveOpenAiCredential({ env: { HOME: "/users/test" }, readFile: async () => auth }),
      ).rejects.toThrow("OpenAI credentials not found");
    },
  );
});

describe("OpenAI OAuth capacity probe", () => {
  const freshOauth = () => fixture("openai-codex-auth.json");
  const whamResponse = () => new Response(fixtureString("wham-usage.json"), { status: 200 });

  it("reports wham usage windows for a fresh Pi OAuth login", async () => {
    const fetch = vi.fn(async () => whamResponse());
    const report = await probeOpenAiCapacity({
      checkedAt,
      env: { HOME: "/users/test" },
      readFile: async () => freshOauth(),
      fetch,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://chatgpt.com/backend-api/wham/usage",
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: `Bearer ${fixtureOauthAccess}`,
          "ChatGPT-Account-Id": "fixture-chatgpt-account-id",
        },
      }),
    );
    expect(report).toMatchObject({
      harness: "pi",
      provider: "openai",
      generatedAt: checkedAt,
      authenticated: true,
      available: "yes",
      creditsRemaining: 4.5,
    });
    expect(report.windows.map((window) => window.id)).toEqual(["session", "weekly"]);
    expect(JSON.stringify(report)).not.toContain("fixture-signature");
  });

  it("does not fetch and reports an authenticated-but-stale state for expired logins", async () => {
    const staleAuth = JSON.stringify({
      "openai-codex": {
        type: "oauth",
        access: "stale-fixture-access",
        expires: 1790000000000,
        accountId: "fixture-chatgpt-account-id",
      },
    });
    const fetch = vi.fn();
    const report = await probeOpenAiCapacity({
      checkedAt,
      env: { HOME: "/users/test" },
      readFile: async () => staleAuth,
      fetch,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(report).toEqual({
      harness: "pi",
      provider: "openai",
      generatedAt: checkedAt,
      authenticated: true,
      available: "unknown",
      windows: [],
      creditsRemaining: null,
    });
  });

  it("treats second-based expiry metadata as stale the same way", async () => {
    const staleAuth = JSON.stringify({
      "openai-codex": {
        type: "oauth",
        access: "stale-fixture-access",
        expires: 1790000000,
        accountId: "fixture-chatgpt-account-id",
      },
    });
    const fetch = vi.fn();
    const report = await probeOpenAiCapacity({
      checkedAt,
      env: { HOME: "/users/test" },
      readFile: async () => staleAuth,
      fetch,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(report.available).toBe("unknown");
  });

  it("falls back to the JWT exp when expires metadata is missing", async () => {
    const expiredJwtAuth = JSON.stringify({
      "openai-codex": {
        type: "oauth",
        access: fakeJwt(JSON.stringify({ exp: 1789000000 })),
        accountId: "fixture-chatgpt-account-id",
      },
    });
    const noFetch = vi.fn();
    await expect(
      probeOpenAiCapacity({
        checkedAt,
        env: { HOME: "/users/test" },
        readFile: async () => expiredJwtAuth,
        fetch: noFetch,
      }),
    ).resolves.toMatchObject({ authenticated: true, available: "unknown" });
    expect(noFetch).not.toHaveBeenCalled();

    const futureJwtAuth = JSON.stringify({
      "openai-codex": {
        type: "oauth",
        access: fakeJwt(JSON.stringify({ exp: 1793000000 })),
        accountId: "fixture-chatgpt-account-id",
      },
    });
    const fetch = vi.fn(async () => whamResponse());
    await expect(
      probeOpenAiCapacity({
        checkedAt,
        env: { HOME: "/users/test" },
        readFile: async () => futureJwtAuth,
        fetch,
      }),
    ).resolves.toMatchObject({ authenticated: true, available: "yes" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("treats unparseable JWT payloads as unknown expiry and probes anyway", async () => {
    const auth = JSON.stringify({
      "openai-codex": {
        type: "oauth",
        access: fakeJwt("not-json"),
        accountId: "fixture-chatgpt-account-id",
      },
    });
    const fetch = vi.fn(async () => whamResponse());
    await expect(
      probeOpenAiCapacity({
        checkedAt,
        env: { HOME: "/users/test" },
        readFile: async () => auth,
        fetch,
      }),
    ).resolves.toMatchObject({ authenticated: true, available: "yes" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("treats non-JWT and exp-less access tokens as unknown expiry and probes anyway", async () => {
    for (const access of ["opaque-fixture-access", "h.eyJzdWIiOiJ4In0.s"]) {
      const auth = JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access,
          accountId: "fixture-chatgpt-account-id",
        },
      });
      const fetch = vi.fn(async () => whamResponse());
      await expect(
        probeOpenAiCapacity({
          checkedAt,
          env: { HOME: "/users/test" },
          readFile: async () => auth,
          fetch,
        }),
      ).resolves.toMatchObject({ authenticated: true, available: "yes" });
      expect(fetch).toHaveBeenCalledOnce();
    }
  });

  it("reports unknown availability when wham returns no usable windows", async () => {
    const report = await probeOpenAiCapacity({
      checkedAt,
      env: { HOME: "/users/test" },
      readFile: async () => freshOauth(),
      fetch: vi.fn(async () => new Response("{}", { status: 200 })),
    });
    expect(report).toMatchObject({ authenticated: true, available: "unknown", windows: [] });
  });

  it("reports unauthenticated when wham rejects the OAuth token", async () => {
    for (const status of [401, 403]) {
      const report = await probeOpenAiCapacity({
        checkedAt,
        env: { HOME: "/users/test" },
        readFile: async () => freshOauth(),
        fetch: vi.fn(async () => new Response("denied", { status })),
      });
      expect(report).toMatchObject({
        authenticated: false,
        available: "unknown",
        windows: [],
        creditsRemaining: null,
      });
    }
  });

  it("throws sanitized errors for transport failures without leaking tokens", async () => {
    const probe = (fetch: unknown) =>
      probeOpenAiCapacity({
        checkedAt,
        env: { HOME: "/users/test" },
        readFile: async () => freshOauth(),
        fetch: fetch as typeof globalThis.fetch,
        timeoutMs: 10,
      });
    await expect(
      probe(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
          ),
      ),
    ).rejects.toThrow("OpenAI usage request failed");
    await expect(probe(vi.fn(async () => new Response("boom", { status: 503 })))).rejects.toThrow(
      "OpenAI usage request failed: HTTP 503",
    );
    await expect(
      probe(vi.fn(async () => new Response("not-json", { status: 200 }))),
    ).rejects.toThrow("OpenAI usage response is not valid JSON");
    try {
      await probe(vi.fn(async () => new Response("boom", { status: 503 })));
    } catch (error) {
      expect(String(error)).not.toContain("fixture-signature");
      expect(String(error)).not.toContain("fixture-chatgpt-account-id");
    }
  });
});

describe("OpenAI usage mapping", () => {
  it("sums per-model input and output tokens into UTC day buckets", async () => {
    const buckets = parseOpenAiUsage(JSON.parse(await fixture("openai-usage-completions.json")));
    expect(buckets).toEqual([
      { startMs: 1790380800000, tokens: 2000 },
      { startMs: 1790294400000, tokens: 5000 },
      { startMs: 1789862400000, tokens: 1000 },
      { startMs: 1789689600000, tokens: 19998 },
    ]);
  });

  it("keeps empty buckets and skips entries it cannot place in time", () => {
    expect(
      parseOpenAiUsage({
        object: "list",
        data: [
          null,
          42,
          { aggregation_timestamp: 1790380800 },
          { aggregation_timestamp: "yesterday", results: [] },
          { aggregation_timestamp: 1790294400, results: null },
        ],
      }),
    ).toEqual([
      { startMs: 1790380800000, tokens: 0 },
      { startMs: 1790294400000, tokens: 0 },
    ]);
  });

  it("rejects responses without a usage data array", () => {
    expect(() => parseOpenAiUsage({ object: "list" })).toThrow("Invalid OpenAI usage response");
    expect(() => parseOpenAiUsage({ data: {} })).toThrow("Invalid OpenAI usage response");
  });

  it("builds today and 7-day windows without faked limits", async () => {
    const buckets = [
      ...parseOpenAiUsage(JSON.parse(await fixture("openai-usage-completions.json"))),
      ...parseOpenAiUsage(JSON.parse(await fixture("openai-usage-responses.json"))),
    ];
    const report = buildOpenAiPlatformCapacity(buckets, checkedAt);
    expect(report).toMatchObject({
      authenticated: true,
      available: "yes",
      creditsRemaining: null,
    });
    expect(report.windows).toEqual([
      {
        id: "openai:tokens:today",
        label: "Tokens · today (UTC)",
        limitType: "TOKENS_LIMIT",
        durationMinutes: 1440,
        usedPercent: null,
        resetsAt: "2026-09-27T00:00:00.000Z",
        total: null,
        current: 2000,
        remaining: null,
      },
      {
        id: "openai:tokens:week",
        label: "Tokens · 7 days",
        limitType: "TOKENS_LIMIT",
        durationMinutes: 10080,
        usedPercent: null,
        resetsAt: null,
        total: null,
        current: 13000,
        remaining: null,
      },
    ]);
  });

  it("reports zero usage for days without buckets", () => {
    const report = buildOpenAiPlatformCapacity([], checkedAt);
    expect(report.windows.map((window) => window.current)).toEqual([0, 0]);
    expect(report.windows[0].resetsAt).toBe("2026-09-27T00:00:00.000Z");
  });
});

describe("OpenAI request", () => {
  it("GETs both usage endpoints for the trailing week with only Bearer authentication", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes("/responses?")
        ? new Response(await fixture("openai-usage-responses.json"), {
            status: 200,
          })
        : new Response(await fixture("openai-usage-completions.json"), {
            status: 200,
          }),
    );
    const report = await probeOpenAiCapacity({
      checkedAt,
      env: { OPENAI_API_KEY: "request-test-key" },
      fetch,
    });
    const query = "start_time=1789812000&end_time=1790416800";
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(
      `https://api.openai.com/v1/organization/usage/completions?${query}`,
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer request-test-key" },
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      `https://api.openai.com/v1/organization/usage/responses?${query}`,
      expect.objectContaining({
        headers: { Authorization: "Bearer request-test-key" },
      }),
    );
    expect(report.windows.map((window) => window.current)).toEqual([2000, 13000]);
    expect(JSON.stringify(report)).not.toContain("request-test-key");
  });

  it("reports unauthenticated for rejected keys", async () => {
    const report = await probeOpenAiCapacity({
      checkedAt,
      env: { OPENAI_API_KEY: "rejected-key" },
      fetch: vi.fn(async () => new Response("denied", { status: 401 })),
    });
    expect(report).toMatchObject({
      authenticated: false,
      available: "unknown",
      windows: [],
      creditsRemaining: null,
    });
  });

  it("degrades to authentication-only when usage requires an admin key", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("/models")
        ? new Response("{}", { status: 200 })
        : new Response("forbidden", { status: 403 }),
    );
    const report = await probeOpenAiCapacity({
      checkedAt,
      env: { OPENAI_API_KEY: "member-key" },
      fetch,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer member-key" },
      }),
    );
    expect(report).toMatchObject({
      authenticated: true,
      available: "unknown",
      windows: [],
    });
  });

  it("falls back to unauthenticated when the degraded check rejects the key", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("/models")
        ? new Response("denied", { status: 401 })
        : new Response("forbidden", { status: 403 }),
    );
    const report = await probeOpenAiCapacity({
      checkedAt,
      env: { OPENAI_API_KEY: "revoked-key" },
      fetch,
    });
    expect(report).toMatchObject({ authenticated: false, windows: [] });
  });

  it("sanitizes network failures on the platform key path", async () => {
    await expect(
      probeOpenAiCapacity({
        checkedAt,
        env: { OPENAI_API_KEY: "network-key" },
        fetch: vi.fn(async () => Promise.reject(new Error("ECONNRESET secret"))),
      }),
    ).rejects.toThrow("OpenAI usage request failed");
    await expect(
      probeOpenAiCapacity({
        checkedAt,
        env: { OPENAI_API_KEY: "network-key" },
        fetch: vi.fn(async (url: string) =>
          url.endsWith("/models")
            ? Promise.reject(new Error("ECONNRESET secret"))
            : new Response("forbidden", { status: 403 }),
        ),
      }),
    ).rejects.toThrow("OpenAI usage request failed");
  });

  it("rejects other statuses and malformed JSON responses with sanitized errors", async () => {
    await expect(
      probeOpenAiCapacity({
        checkedAt,
        env: { OPENAI_API_KEY: "never-expose-this-key" },
        fetch: vi.fn(async () => new Response("private body", { status: 503 })),
      }),
    ).rejects.toThrow("OpenAI usage request failed: HTTP 503");
    await expect(
      probeOpenAiCapacity({
        checkedAt,
        env: { OPENAI_API_KEY: "never-expose-this-key" },
        fetch: vi.fn(async () => new Response("not-json", { status: 200 })),
      }),
    ).rejects.toThrow("OpenAI usage response is not valid JSON");
  });
});
