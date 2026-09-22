import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  Availability,
  CapacityLimitType,
  CapacityReport,
  CapacityWindow,
} from "./types.js";

const ZAI_QUOTA_URL = "https://api.z.ai/api/monitor/usage/quota/limit";
const MISSING_API_KEY_MESSAGE =
  "z.ai API key not found; set Z_AI_API_KEY or configure Pi provider zai";
const LIMIT_METADATA = {
  TOKENS_LIMIT: { id: "tokens", label: "Tokens" },
  CREDIT_LIMIT: { id: "credit", label: "Credit" },
  TIME_LIMIT: { id: "time", label: "Time" },
} as const satisfies Record<CapacityLimitType, { id: string; label: string }>;
const UNIT_METADATA = new Map<number, { minutes: number; label: string }>([
  [1, { minutes: 24 * 60, label: "day" }],
  [3, { minutes: 60, label: "hour" }],
  [5, { minutes: 1, label: "minute" }],
  [6, { minutes: 7 * 24 * 60, label: "week" }],
]);
type UnknownRecord = Record<string, unknown>;

export type ZaiCredentialOptions = {
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
};

export type ZaiProbeOptions = ZaiCredentialOptions & {
  checkedAt: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid z.ai quota ${field}`);
  }
  return value;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function isCapacityLimitType(value: string): value is CapacityLimitType {
  return Object.hasOwn(LIMIT_METADATA, value);
}

function durationMinutes(
  unit: number,
  number: number,
  type: CapacityLimitType,
): number | null {
  if (type === "TIME_LIMIT" && unit === 5 && number === 1) return 30 * 24 * 60;
  const metadata = UNIT_METADATA.get(unit);
  return metadata === undefined || number <= 0
    ? null
    : metadata.minutes * number;
}

function windowLabel(
  type: CapacityLimitType,
  unit: number,
  number: number,
): string {
  if (type === "TIME_LIMIT" && unit === 5 && number === 1)
    return "MCP · monthly";
  const kind = LIMIT_METADATA[type].label;
  const unitLabel = UNIT_METADATA.get(unit)?.label;
  if (!unitLabel) return kind;
  return `${kind} · ${number} ${unitLabel}${number === 1 ? "" : "s"}`;
}

function resetTime(value: unknown): string | null {
  const milliseconds = optionalNumber(value, "limit nextResetTime");
  if (milliseconds === null) return null;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime()))
    throw new Error("Invalid z.ai quota limit nextResetTime");
  return date.toISOString();
}

function availability(windows: CapacityWindow[]): Availability {
  if (windows.length === 0) return "unknown";
  if (
    windows.some(
      (window) => window.usedPercent !== null && window.usedPercent < 100,
    )
  ) {
    return "yes";
  }
  return "no";
}

function parseLimit(value: unknown, index: number): CapacityWindow | null {
  const limit = record(value);
  if (!limit) throw new Error("Invalid z.ai quota limit entry");
  const unit = integer(limit.unit);
  const count = integer(limit.number);
  if (typeof limit.type !== "string" || unit === null || count === null) {
    throw new Error("Invalid z.ai quota limit entry");
  }
  const serverPercent = optionalNumber(limit.percentage, "limit percentage");
  if (serverPercent === null)
    throw new Error("Invalid z.ai quota limit percentage");
  if (!isCapacityLimitType(limit.type)) return null;

  const total = optionalNumber(limit.usage, "limit usage");
  const current = optionalNumber(limit.currentValue, "limit currentValue");
  const remaining = optionalNumber(limit.remaining, "limit remaining");
  let consumed =
    total !== null && remaining !== null ? total - remaining : null;
  if (current !== null) consumed = Math.max(consumed ?? current, current);

  let usedPercent = serverPercent;
  if (total !== null && total > 0 && consumed !== null) {
    usedPercent = (consumed / total) * 100;
  }
  const metadata = LIMIT_METADATA[limit.type];

  return {
    id: `zai:${metadata.id}:${index + 1}`,
    label: windowLabel(limit.type, unit, count),
    limitType: limit.type,
    durationMinutes: durationMinutes(unit, count, limit.type),
    usedPercent: clampPercent(usedPercent),
    resetsAt: resetTime(limit.nextResetTime),
    total,
    current,
    remaining,
  };
}

export async function resolveZaiApiKey(
  options: ZaiCredentialOptions = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const environmentKey = nonEmptyText(env.Z_AI_API_KEY);
  if (environmentKey) return environmentKey;

  const authPath = join(env.HOME || homedir(), ".pi", "agent", "auth.json");
  let parsed: UnknownRecord;
  try {
    const contents = await (options.readFile ?? readFile)(authPath, "utf8");
    const root = record(JSON.parse(contents));
    if (!root) throw new Error("invalid");
    parsed = root;
  } catch (error) {
    if (record(error)?.code === "ENOENT") {
      throw new Error(MISSING_API_KEY_MESSAGE);
    }
    throw new Error("z.ai Pi auth file is malformed");
  }

  const credential = record(parsed.zai);
  if (!credential) {
    throw new Error(MISSING_API_KEY_MESSAGE);
  }
  const key =
    credential.type === "api_key" ? nonEmptyText(credential.key) : null;
  if (!key) throw new Error("z.ai Pi auth file has a malformed zai credential");
  return key;
}

export function parseZaiQuota(raw: unknown, checkedAt: string): CapacityReport {
  const root = record(raw);
  const data = record(root?.data);
  if (
    root?.success !== true ||
    root.code !== 200 ||
    !data ||
    !Array.isArray(data.limits)
  ) {
    throw new Error("Invalid z.ai quota response");
  }
  const windows = data.limits
    .map(parseLimit)
    .filter((window): window is CapacityWindow => window !== null);
  return {
    harness: "pi",
    provider: "zai",
    generatedAt: checkedAt,
    authenticated: true,
    available: availability(windows),
    windows,
    creditsRemaining: null,
  };
}

export async function probeZaiCapacity(
  options: ZaiProbeOptions,
): Promise<CapacityReport> {
  const key = await resolveZaiApiKey(options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  let response: Response;
  try {
    response = await (options.fetch ?? globalThis.fetch)(ZAI_QUOTA_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
  } catch {
    throw new Error("z.ai quota request failed");
  } finally {
    clearTimeout(timer);
  }
  if (response.status !== 200) {
    throw new Error(`z.ai quota request failed: HTTP ${response.status}`);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error("z.ai quota response is not valid JSON");
  }
  return parseZaiQuota(raw, options.checkedAt);
}
