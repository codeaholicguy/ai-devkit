import type { CapacityWindow, ProviderCapacitySnapshot } from "../types.js";

const WHAM_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const OPENAI_WHOAMI_URL = "https://auth.openai.com/api/accounts/v1/user-auth-credential/whoami";

export type OpenAiSubscriptionCredential = {
  access: string;
  accountId: string;
};

export type OpenAiSubscriptionCapacityOptions = {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export type WhamUsageSnapshot = {
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
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
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

export async function fetchOpenAiSubscriptionCapacity(
  credential: OpenAiSubscriptionCredential,
  options: OpenAiSubscriptionCapacityOptions = {},
): Promise<ProviderCapacitySnapshot> {
  let response: Response;
  try {
    response = await (options.fetch ?? globalThis.fetch)(WHAM_USAGE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credential.access}`,
        "ChatGPT-Account-Id": credential.accountId,
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
    });
  } catch {
    throw new Error("OpenAI usage request failed");
  }
  if (response.status === 401 || response.status === 403) {
    return {
      authenticated: false,
      available: "unknown",
      windows: [],
      creditsRemaining: null,
    };
  }
  if (response.status !== 200) {
    throw new Error(`OpenAI usage request failed: HTTP ${response.status}`);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error("OpenAI usage response is not valid JSON");
  }
  const snapshot = parseWhamUsage(raw);
  const hasUsage = snapshot.windows.some((window) => window.usedPercent !== null);
  return {
    authenticated: true,
    available: hasUsage ? "yes" : "unknown",
    windows: snapshot.windows,
    creditsRemaining: snapshot.creditsRemaining,
  };
}

export async function fetchOpenAiPatAccountId(
  token: string,
  options: OpenAiSubscriptionCapacityOptions = {},
): Promise<string> {
  let response: Response;
  try {
    response = await (options.fetch ?? globalThis.fetch)(OPENAI_WHOAMI_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
    });
  } catch {
    throw new Error("OpenAI account request failed");
  }
  if (!response.ok) throw new Error("OpenAI account request failed");
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error("OpenAI account response is not valid JSON");
  }
  const accountId = nonEmptyText(record(raw)?.chatgpt_account_id);
  if (!accountId) throw new Error("OpenAI account unavailable");
  return accountId;
}
