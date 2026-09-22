import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  parseZaiQuota,
  probeZaiCapacity,
  resolveZaiApiKey,
} from "../../capacity/zai.js";

const checkedAt = "2026-08-20T10:00:00.000Z";
const fixture = (name: string) =>
  readFile(
    fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
    "utf8",
  );

describe("z.ai credential resolution", () => {
  it("prefers Z_AI_API_KEY without reading Pi auth", async () => {
    const readAuth = vi.fn(async () => fixture("zai-auth.json"));
    await expect(
      resolveZaiApiKey({
        env: { Z_AI_API_KEY: "env-zai-test-key" },
        readFile: readAuth,
      }),
    ).resolves.toBe("env-zai-test-key");
    expect(readAuth).not.toHaveBeenCalled();
  });

  it("reads the Pi zai api_key credential from ~/.pi/agent/auth.json", async () => {
    const readAuth = vi.fn(async () => fixture("zai-auth.json"));
    await expect(
      resolveZaiApiKey({ env: { HOME: "/users/test" }, readFile: readAuth }),
    ).resolves.toBe("pi-zai-test-key");
    expect(readAuth).toHaveBeenCalledWith(
      "/users/test/.pi/agent/auth.json",
      "utf8",
    );
  });

  it.each([
    [
      "missing",
      async () =>
        Promise.reject(Object.assign(new Error("missing"), { code: "ENOENT" })),
    ],
    ["invalid JSON", async () => "{"],
    [
      "wrong credential type",
      async () => JSON.stringify({ zai: { type: "oauth", key: "x" } }),
    ],
    ["missing key", async () => JSON.stringify({ zai: { type: "api_key" } })],
  ])(
    "fails clearly for %s credentials without exposing file content",
    async (_name, readAuth) => {
      await expect(
        resolveZaiApiKey({ env: { HOME: "/users/test" }, readFile: readAuth }),
      ).rejects.toThrow(/z\.ai API key|z\.ai Pi auth file/);
    },
  );
});

describe("z.ai quota mapping", () => {
  it("maps token, credit, and monthly MCP windows with recomputed usage", async () => {
    const report = parseZaiQuota(
      JSON.parse(await fixture("zai-quota.json")),
      checkedAt,
    );
    expect(report).toMatchObject({
      harness: "pi",
      provider: "zai",
      generatedAt: checkedAt,
      authenticated: true,
      available: "yes",
      creditsRemaining: null,
    });
    expect(report.windows).toEqual([
      {
        id: "zai:tokens:1",
        label: "Tokens · 5 hours",
        limitType: "TOKENS_LIMIT",
        durationMinutes: 300,
        usedPercent: 30,
        resetsAt: "2026-08-20T10:00:00.000Z",
        total: 1000,
        current: 200,
        remaining: 700,
      },
      {
        id: "zai:credit:2",
        label: "Credit · 1 week",
        limitType: "CREDIT_LIMIT",
        durationMinutes: 10080,
        usedPercent: 40,
        resetsAt: "2026-08-27T10:00:00.000Z",
        total: 200,
        current: 80,
        remaining: 150,
      },
      {
        id: "zai:time:3",
        label: "MCP · monthly",
        limitType: "TIME_LIMIT",
        durationMinutes: 43200,
        usedPercent: 20,
        resetsAt: "2026-09-19T10:00:00.000Z",
        total: 100,
        current: 20,
        remaining: 90,
      },
    ]);
  });

  it("uses and clamps the server percentage when quota amounts are unavailable", () => {
    const report = parseZaiQuota(
      {
        success: true,
        code: 200,
        data: {
          limits: [
            { type: "TOKENS_LIMIT", unit: 1, number: 1, percentage: 120 },
            { type: "CREDIT_LIMIT", unit: 5, number: 30, percentage: -5 },
          ],
        },
      },
      checkedAt,
    );
    expect(report.windows.map((window) => window.usedPercent)).toEqual([
      100, 0,
    ]);
  });

  it.each([
    [
      "invalid fixture",
      async () => JSON.parse(await fixture("zai-quota-invalid.json")),
    ],
    [
      "unsuccessful envelope",
      async () => ({ success: false, code: 401, data: { limits: [] } }),
    ],
    [
      "invalid entry",
      async () => ({ success: true, code: 200, data: { limits: [{}] } }),
    ],
  ])("rejects %s", async (_name, input) => {
    const value = await input();
    expect(() => parseZaiQuota(value, checkedAt)).toThrow(/z\.ai quota/);
  });
});

describe("z.ai request", () => {
  it("GETs the global quota endpoint with only Bearer authentication", async () => {
    const body = await fixture("zai-quota.json");
    const fetch = vi.fn(async () => new Response(body, { status: 200 }));
    const report = await probeZaiCapacity({
      checkedAt,
      env: { Z_AI_API_KEY: "request-test-key" },
      fetch,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.z.ai/api/monitor/usage/quota/limit",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer request-test-key" },
      }),
    );
    expect(JSON.stringify(report)).not.toContain("request-test-key");
  });

  it("rejects non-200 and malformed JSON responses with sanitized errors", async () => {
    await expect(
      probeZaiCapacity({
        checkedAt,
        env: { Z_AI_API_KEY: "never-expose-this-key" },
        fetch: vi.fn(async () => new Response("private body", { status: 503 })),
      }),
    ).rejects.toThrow("z.ai quota request failed: HTTP 503");
    await expect(
      probeZaiCapacity({
        checkedAt,
        env: { Z_AI_API_KEY: "never-expose-this-key" },
        fetch: vi.fn(async () => new Response("not-json", { status: 200 })),
      }),
    ).rejects.toThrow("z.ai quota response is not valid JSON");
  });
});
