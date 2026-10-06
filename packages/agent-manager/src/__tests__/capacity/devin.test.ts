import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parseDevinCapacity } from "../../capacity/providers/devin.js";
import { probeDevinCapacity } from "../../capacity/sources/devin.js";
import { resolveDevinCredential } from "../../harnesses/devin/credentials.js";

const checkedAt = "2026-10-05T10:00:00.000Z";
const fixture = (name: string) =>
  readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

const credentialFiles = async (path: string): Promise<string> => {
  if (path === "/users/test/.local/share/devin/credentials.toml") {
    return fixture("devin-credentials.toml");
  }
  if (path === "/users/test/.config/devin/config.json") {
    return fixture("devin-config.json");
  }
  throw Object.assign(new Error("missing"), { code: "ENOENT" });
};

describe("devin credential resolution", () => {
  it("prefers DEVIN_API_KEY and DEVIN_ORG_ID without reading files", async () => {
    const reader = vi.fn(credentialFiles);
    await expect(
      resolveDevinCredential({
        env: { DEVIN_API_KEY: "env-key", DEVIN_ORG_ID: "org-env" },
        readFile: reader,
      }),
    ).resolves.toEqual({ key: "env-key", orgId: "org-env" });
    expect(reader).not.toHaveBeenCalled();
  });

  it("reads the key from credentials.toml and org from config.json", async () => {
    const reader = vi.fn(credentialFiles);
    await expect(
      resolveDevinCredential({ env: { HOME: "/users/test" }, readFile: reader }),
    ).resolves.toEqual({ key: "devin-test-key", orgId: "org-test1234" });
    expect(reader).toHaveBeenCalledWith("/users/test/.local/share/devin/credentials.toml", "utf8");
    expect(reader).toHaveBeenCalledWith("/users/test/.config/devin/config.json", "utf8");
  });

  it.each([
    [
      "missing credentials file",
      async (path: string) => {
        if (path.endsWith("config.json")) return fixture("devin-config.json");
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
      /Devin API key not found/,
    ],
    [
      "malformed credentials file",
      async (path: string) => {
        if (path.endsWith("credentials.toml")) return "not = [valid";
        return fixture("devin-config.json");
      },
      /credentials file is malformed/,
    ],
    [
      "credentials without key",
      async (path: string) => {
        if (path.endsWith("credentials.toml")) return 'api_server_url = "https://x"';
        return fixture("devin-config.json");
      },
      /Devin API key not found/,
    ],
    [
      "missing config file",
      async (path: string) => {
        if (path.endsWith("credentials.toml")) return fixture("devin-credentials.toml");
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
      /Devin organization id not found/,
    ],
    [
      "config without org_id",
      async (path: string) => {
        if (path.endsWith("credentials.toml")) return fixture("devin-credentials.toml");
        return JSON.stringify({ devin: {} });
      },
      /Devin organization id not found/,
    ],
  ])("fails clearly for %s without exposing file content", async (_name, readFileImpl, pattern) => {
    await expect(
      resolveDevinCredential({ env: { HOME: "/users/test" }, readFile: readFileImpl }),
    ).rejects.toThrow(pattern);
  });
});

describe("devin quota mapping", () => {
  it("maps daily and weekly windows with credits", async () => {
    const report = parseDevinCapacity(JSON.parse(await fixture("devin-quota.json")));
    expect(report).toMatchObject({
      authenticated: true,
      available: "yes",
      creditsRemaining: 12.5,
    });
    expect(report.windows).toEqual([
      {
        id: "devin:daily",
        label: "Daily",
        durationMinutes: 1440,
        usedPercent: 25,
        resetsAt: "2026-10-06T08:00:00.000Z",
      },
      {
        id: "devin:weekly",
        label: "Weekly",
        durationMinutes: 10080,
        usedPercent: 60,
        resetsAt: "2026-10-11T08:00:00.000Z",
      },
    ]);
  });

  it("omits the daily window when hide_daily_quota is true", () => {
    const report = parseDevinCapacity({
      is_quota_plan: true,
      has_quota_allocation: true,
      daily_percentage: 90,
      weekly_percentage: 10,
      hide_daily_quota: true,
    });
    expect(report.windows.map((window) => window.id)).toEqual(["devin:weekly"]);
  });

  it("reports authenticated unknown availability for non-quota plans", async () => {
    const report = parseDevinCapacity(JSON.parse(await fixture("devin-quota-nonplan.json")));
    expect(report).toEqual({
      authenticated: true,
      available: "unknown",
      windows: [],
      creditsRemaining: null,
    });
  });

  it("clamps percentages and degrades missing fields honestly", () => {
    const report = parseDevinCapacity({
      is_quota_plan: true,
      has_quota_allocation: true,
      daily_percentage: 140,
      weekly_reset_at: "not-a-date",
      overage_balance: "unknown",
    });
    const [daily, weekly] = report.windows;
    expect(daily.usedPercent).toBe(100);
    expect(weekly.usedPercent).toBeNull();
    expect(weekly.resetsAt).toBeNull();
    expect(report.creditsRemaining).toBeNull();
    expect(report.available).toBe("no");
  });

  it("rejects non-object responses", () => {
    expect(() => parseDevinCapacity("nope")).toThrow(/Devin quota/);
    expect(() => parseDevinCapacity(null)).toThrow(/Devin quota/);
  });
});

describe("devin request", () => {
  it("GETs the org quota endpoint with only Bearer authentication", async () => {
    const body = await fixture("devin-quota.json");
    const fetch = vi.fn(async () => new Response(body, { status: 200 }));
    const report = await probeDevinCapacity({
      checkedAt,
      env: { DEVIN_API_KEY: "request-test-key", DEVIN_ORG_ID: "org-abc" },
      fetch,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://app.devin.ai/api/org-abc/billing/quota/usage",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer request-test-key" },
      }),
    );
    expect(report.harness).toBe("devin");
    expect(report.provider).toBe("devin");
    expect(JSON.stringify(report)).not.toContain("request-test-key");
  });

  it.each([401, 403])("reports HTTP %i as unauthenticated", async (status) => {
    const report = await probeDevinCapacity({
      checkedAt,
      env: { DEVIN_API_KEY: "request-test-key", DEVIN_ORG_ID: "org-abc" },
      fetch: vi.fn(async () => new Response("denied", { status })),
    });
    expect(report).toMatchObject({
      authenticated: false,
      available: "unknown",
      windows: [],
    });
  });

  it("rejects other non-200 and malformed JSON responses with sanitized errors", async () => {
    await expect(
      probeDevinCapacity({
        checkedAt,
        env: { DEVIN_API_KEY: "never-expose-this-key", DEVIN_ORG_ID: "org-abc" },
        fetch: vi.fn(async () => new Response("private body", { status: 503 })),
      }),
    ).rejects.toThrow("Devin quota request failed: HTTP 503");
    await expect(
      probeDevinCapacity({
        checkedAt,
        env: { DEVIN_API_KEY: "never-expose-this-key", DEVIN_ORG_ID: "org-abc" },
        fetch: vi.fn(async () => new Response("not-json", { status: 200 })),
      }),
    ).rejects.toThrow("Devin quota response is not valid JSON");
  });
});
