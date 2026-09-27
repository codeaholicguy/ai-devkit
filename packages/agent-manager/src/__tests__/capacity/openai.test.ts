import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  buildOpenAiReport,
  parseOpenAiUsage,
  probeOpenAiCapacity,
  resolveOpenAiApiKey,
} from "../../capacity/openai.js";

const checkedAt = "2026-09-26T10:00:00.000Z";
const fixture = (name: string) =>
  readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("OpenAI credential resolution", () => {
  it("prefers OPENAI_API_KEY without reading Pi auth", async () => {
    const readAuth = vi.fn(async () => fixture("openai-auth.json"));
    await expect(
      resolveOpenAiApiKey({
        env: { OPENAI_API_KEY: "env-openai-test-key" },
        readFile: readAuth,
      }),
    ).resolves.toBe("env-openai-test-key");
    expect(readAuth).not.toHaveBeenCalled();
  });

  it("reads the Pi openai api_key credential from ~/.pi/agent/auth.json", async () => {
    const readAuth = vi.fn(async () => fixture("openai-auth.json"));
    await expect(
      resolveOpenAiApiKey({ env: { HOME: "/users/test" }, readFile: readAuth }),
    ).resolves.toBe("pi-openai-test-key");
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
      resolveOpenAiApiKey({
        env: { HOME: "/users/test" },
        readFile: readAuth,
      }),
    ).rejects.toThrow(/OpenAI API key|OpenAI Pi auth file/);
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
    const report = buildOpenAiReport(buckets, checkedAt);
    expect(report).toMatchObject({
      harness: "pi",
      provider: "openai",
      generatedAt: checkedAt,
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
    const report = buildOpenAiReport([], checkedAt);
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
