import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseWhamUsage, toRateWindow } from "../../capacity/providers/openai-subscription.js";

const fixture = (name: string) =>
  readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("wham usage parsing", () => {
  it("maps primary and secondary rate windows onto session and weekly", async () => {
    const snapshot = parseWhamUsage(JSON.parse(await fixture("wham-usage.json")));
    expect(snapshot.windows).toEqual([
      {
        id: "session",
        label: "Session",
        durationMinutes: 300,
        usedPercent: 12.5,
        resetsAt: "2026-09-27T13:52:07.000Z",
      },
      {
        id: "weekly",
        label: "Weekly",
        durationMinutes: 10080,
        usedPercent: 43.2,
        resetsAt: "2026-10-04T08:52:07.000Z",
      },
    ]);
    expect(snapshot.creditsRemaining).toBe(4.5);
  });

  it("accepts epoch seconds and ISO strings for reset_at", () => {
    expect(toRateWindow({ used_percent: 1, reset_at: 1_787_220_000 }, "a", "A")?.resetsAt).toBe(
      "2026-08-20T10:00:00.000Z",
    );
    expect(
      toRateWindow({ used_percent: 1, reset_at: "2026-08-20T10:00:00Z" }, "a", "A")?.resetsAt,
    ).toBe("2026-08-20T10:00:00.000Z");
    expect(toRateWindow({ used_percent: 1, reset_at: "nope" }, "a", "A")?.resetsAt).toBeNull();
  });

  it("maps additional_rate_limits into scoped windows and tolerates non-array values", () => {
    const scoped = parseWhamUsage({
      rate_limit: {},
      additional_rate_limits: [
        {
          limit_name: "code-review",
          rate_limit: {
            primary_window: { used_percent: 10, limit_window_seconds: 3600, reset_at: 100 },
            secondary_window: { used_percent: 20, limit_window_seconds: 7200, reset_at: 200 },
          },
        },
      ],
    });
    expect(scoped.windows.map((window) => window.id)).toEqual([
      "code-review:primary",
      "code-review:secondary",
    ]);
    expect(parseWhamUsage({ additional_rate_limits: null }).windows).toEqual([]);
  });

  it("falls back to positional ids and inline windows for degraded extra limits", () => {
    const scoped = parseWhamUsage({
      additional_rate_limits: [
        null,
        42,
        { primary_window: { used_percent: 5 } },
        { limit_name: "not/safe", primary_window: { used_percent: 6 } },
        { limit_name: "token-123456", primary_window: { used_percent: 7 } },
        { limit_name: "ok", secondary_window: { used_percent: 8 } },
      ],
    });
    expect(scoped.windows.map((window) => window.id)).toEqual([
      "extra-3:primary",
      "extra-4:primary",
      "extra-5:primary",
      "ok:secondary",
    ]);
  });

  it("parses non-object payloads into an empty snapshot", () => {
    expect(parseWhamUsage(null)).toEqual({ windows: [], creditsRemaining: null });
    expect(parseWhamUsage(42)).toEqual({ windows: [], creditsRemaining: null });
  });

  it("never invents usage for windows it cannot parse", () => {
    const snapshot = parseWhamUsage({
      rate_limit: {
        primary_window: { limit_window_seconds: 18000 },
        secondary_window: null,
      },
    });
    expect(snapshot.windows).toEqual([
      {
        id: "session",
        label: "Session",
        durationMinutes: 300,
        usedPercent: null,
        resetsAt: null,
      },
    ]);
    expect(parseWhamUsage({}).creditsRemaining).toBeNull();
    expect(parseWhamUsage({ credits: { balance: "nan" } }).creditsRemaining).toBeNull();
  });
});
