import type { CapacityWindow } from "./types.js";

type WhamUsageSnapshot = {
  windows: CapacityWindow[];
  creditsRemaining: number | null;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function resetTime(value: unknown): string | null {
  const seconds = finiteNumber(value);
  if (seconds !== null) return new Date(seconds * 1000).toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value)))
    return new Date(value).toISOString();
  return null;
}

export function safeIdentifier(value: unknown): string | null {
  const candidate = nonEmptyText(value);
  if (!candidate || !/^[a-z][a-z0-9_-]{0,63}$/i.test(candidate)) return null;
  if (/(?:account|token|secret|key)[_-]?\d{6,}/i.test(candidate)) return null;
  return candidate;
}

export function toRateWindow(value: unknown, id: string, label: string): CapacityWindow | null {
  const input = record(value);
  if (!input) return null;
  const used = finiteNumber(input.used_percent);
  const seconds = finiteNumber(input.limit_window_seconds);
  return {
    id,
    label,
    durationMinutes: seconds === null ? null : seconds / 60,
    usedPercent: used,
    resetsAt: resetTime(input.reset_at),
  };
}

function extraWindows(value: unknown): CapacityWindow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const limit = record(entry);
    if (!limit) return [];
    const scope = safeIdentifier(limit.limit_name) ?? `extra-${index + 1}`;
    const windows = record(limit.rate_limit) ?? limit;
    return [
      toRateWindow(windows.primary_window, `${scope}:primary`, `${scope} primary`),
      toRateWindow(windows.secondary_window, `${scope}:secondary`, `${scope} secondary`),
    ].filter((window): window is CapacityWindow => window !== null);
  });
}

/**
 * Parses the chatgpt.com backend wham/usage payload shared by every
 * OAuth-backed OpenAI consumer (codex harness and pi login) into generic
 * capacity windows plus the credit balance.
 */
export function parseWhamUsage(raw: unknown): WhamUsageSnapshot {
  const response = record(raw) ?? {};
  const limits = record(response.rate_limit) ?? {};
  const credits = record(response.credits) ?? {};
  return {
    windows: [
      toRateWindow(limits.primary_window, "session", "Session"),
      toRateWindow(limits.secondary_window, "weekly", "Weekly"),
      ...extraWindows(response.additional_rate_limits),
    ].filter((window): window is CapacityWindow => window !== null),
    creditsRemaining: finiteNumber(credits.balance),
  };
}
