import type { CapacityWindow, ProviderCapacitySnapshot } from "../types.js";

const OPENAI_USAGE_BASE_URL = "https://api.openai.com/v1/organization/usage";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";
const OPENAI_USAGE_ENDPOINTS = ["completions", "responses"] as const;
const USAGE_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type OpenAiUsageBucket = { startMs: number; tokens: number };
export type OpenAiPlatformCapacityOptions = {
  checkedAt: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
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

function bucketTokens(value: unknown): number {
  const results = Array.isArray(value) ? value : [];
  return results.reduce(
    (total, entry) =>
      total +
      (finiteNumber(record(entry)?.input_tokens) ?? 0) +
      (finiteNumber(record(entry)?.output_tokens) ?? 0),
    0,
  );
}

export function parseOpenAiUsage(raw: unknown): OpenAiUsageBucket[] {
  const data = record(raw)?.data;
  if (!Array.isArray(data)) throw new Error("Invalid OpenAI usage response");
  const buckets: OpenAiUsageBucket[] = [];
  for (const entry of data) {
    const seconds = finiteNumber(record(entry)?.aggregation_timestamp);
    if (seconds === null) continue;
    buckets.push({ startMs: seconds * 1000, tokens: bucketTokens(record(entry)?.results) });
  }
  return buckets;
}

function emptySnapshot(authenticated: boolean): ProviderCapacitySnapshot {
  return {
    authenticated,
    available: "unknown",
    windows: [],
    creditsRemaining: null,
  };
}

export function buildOpenAiPlatformCapacity(
  buckets: OpenAiUsageBucket[],
  checkedAt: string,
): ProviderCapacitySnapshot {
  const nowMs = Date.parse(checkedAt);
  const todayStartMs = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const weekStartMs = todayStartMs - (USAGE_WINDOW_DAYS - 1) * DAY_MS;
  let todayTokens = 0;
  let weekTokens = 0;
  for (const bucket of buckets) {
    if (bucket.startMs === todayStartMs) todayTokens += bucket.tokens;
    if (bucket.startMs >= weekStartMs) weekTokens += bucket.tokens;
  }
  const windows: CapacityWindow[] = [
    {
      id: "openai:tokens:today",
      label: "Tokens · today (UTC)",
      limitType: "TOKENS_LIMIT",
      durationMinutes: 24 * 60,
      usedPercent: null,
      resetsAt: new Date(todayStartMs + DAY_MS).toISOString(),
      total: null,
      current: todayTokens,
      remaining: null,
    },
    {
      id: "openai:tokens:week",
      label: "Tokens · 7 days",
      limitType: "TOKENS_LIMIT",
      durationMinutes: USAGE_WINDOW_DAYS * 24 * 60,
      usedPercent: null,
      resetsAt: null,
      total: null,
      current: weekTokens,
      remaining: null,
    },
  ];
  return {
    authenticated: true,
    available: "yes",
    windows,
    creditsRemaining: null,
  };
}

async function request(
  url: string,
  key: string,
  options: OpenAiPlatformCapacityOptions,
): Promise<Response> {
  try {
    return await (options.fetch ?? globalThis.fetch)(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
    });
  } catch {
    throw new Error("OpenAI usage request failed");
  }
}

async function verifyKey(key: string, options: OpenAiPlatformCapacityOptions): Promise<boolean> {
  const response = await request(OPENAI_MODELS_URL, key, options);
  return response.status !== 401;
}

export async function fetchOpenAiPlatformCapacity(
  key: string,
  options: OpenAiPlatformCapacityOptions,
): Promise<ProviderCapacitySnapshot> {
  const endSeconds = Math.floor(Date.parse(options.checkedAt) / 1000);
  const startSeconds = endSeconds - USAGE_WINDOW_DAYS * 24 * 60 * 60;
  const query = `start_time=${startSeconds}&end_time=${endSeconds}`;
  const payloads: unknown[] = [];

  for (const endpoint of OPENAI_USAGE_ENDPOINTS) {
    const response = await request(`${OPENAI_USAGE_BASE_URL}/${endpoint}?${query}`, key, options);
    if (response.status === 401) return emptySnapshot(false);
    if (response.status === 403) return emptySnapshot(await verifyKey(key, options));
    if (response.status !== 200) {
      throw new Error(`OpenAI usage request failed: HTTP ${response.status}`);
    }
    try {
      payloads.push(await response.json());
    } catch {
      throw new Error("OpenAI usage response is not valid JSON");
    }
  }

  return buildOpenAiPlatformCapacity(payloads.flatMap(parseOpenAiUsage), options.checkedAt);
}
