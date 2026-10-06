import type { Availability, CapacityWindow, ProviderCapacitySnapshot } from "../types.js";
import type { DevinCredential } from "../../harnesses/devin/credentials.js";

const DEVIN_WEBAPP_HOST = "https://app.devin.ai";
const DAY_MINUTES = 24 * 60;
const WEEK_MINUTES = 7 * 24 * 60;

type UnknownRecord = Record<string, unknown>;

export type DevinRequestOptions = {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export class DevinHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DevinHttpError";
  }
}

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function percent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function availability(windows: CapacityWindow[]): Availability {
  if (windows.length === 0) return "unknown";
  return windows.some((window) => window.usedPercent !== null && window.usedPercent < 100)
    ? "yes"
    : "no";
}

export function parseDevinCapacity(raw: unknown): ProviderCapacitySnapshot {
  const root = record(raw);
  if (!root) throw new Error("Invalid Devin quota response");

  if (root.is_quota_plan !== true || root.has_quota_allocation !== true) {
    return {
      authenticated: true,
      available: "unknown",
      windows: [],
      creditsRemaining: null,
    };
  }

  const windows: CapacityWindow[] = [];
  if (root.hide_daily_quota !== true) {
    windows.push({
      id: "devin:daily",
      label: "Daily",
      durationMinutes: DAY_MINUTES,
      usedPercent: percent(root.daily_percentage),
      resetsAt: timestamp(root.daily_reset_at),
    });
  }
  windows.push({
    id: "devin:weekly",
    label: "Weekly",
    durationMinutes: WEEK_MINUTES,
    usedPercent: percent(root.weekly_percentage),
    resetsAt: timestamp(root.weekly_reset_at),
  });

  return {
    authenticated: true,
    available: availability(windows),
    windows,
    creditsRemaining: finiteNumber(root.overage_balance),
  };
}

export async function fetchDevinCapacity(
  credential: DevinCredential,
  options: DevinRequestOptions = {},
): Promise<ProviderCapacitySnapshot> {
  const url = `${DEVIN_WEBAPP_HOST}/api/${encodeURIComponent(credential.orgId)}/billing/quota/usage`;
  let response: Response;
  try {
    response = await (options.fetch ?? globalThis.fetch)(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${credential.key}` },
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
    });
  } catch {
    throw new Error("Devin quota request failed");
  }
  if (response.status !== 200) {
    throw new DevinHttpError(
      response.status,
      `Devin quota request failed: HTTP ${response.status}`,
    );
  }
  try {
    return parseDevinCapacity(await response.json());
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Devin quota response is not valid JSON");
    }
    throw error;
  }
}
