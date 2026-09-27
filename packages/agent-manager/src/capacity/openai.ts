import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CapacityReport, CapacityWindow } from "./types.js";

const OPENAI_USAGE_BASE_URL = "https://api.openai.com/v1/organization/usage";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";
const OPENAI_USAGE_ENDPOINTS = ["completions", "responses"] as const;
const USAGE_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const MISSING_API_KEY_MESSAGE =
  "OpenAI API key not found; set OPENAI_API_KEY or configure Pi provider openai";

export type OpenAiUsageBucket = { startMs: number; tokens: number };
type UnknownRecord = Record<string, unknown>;

export type OpenAiCredentialOptions = {
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
};

export type OpenAiProbeOptions = OpenAiCredentialOptions & {
  checkedAt: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};
type OpenAiRequestContext = OpenAiProbeOptions & { key: string };

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function resolveOpenAiApiKey(options: OpenAiCredentialOptions = {}): Promise<string> {
  const env = options.env ?? process.env;
  const environmentKey = nonEmptyText(env.OPENAI_API_KEY);
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
    throw new Error("OpenAI Pi auth file is malformed");
  }

  const credential = record(parsed.openai);
  if (!credential) {
    throw new Error(MISSING_API_KEY_MESSAGE);
  }
  const key = credential.type === "api_key" ? nonEmptyText(credential.key) : null;
  if (!key) {
    throw new Error("OpenAI Pi auth file has a malformed openai credential");
  }
  return key;
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

/**
 * Maps one OpenAI Usage API payload (day buckets of per-model token counts)
 * into summed UTC-day buckets. Entries without a numeric
 * aggregation_timestamp are skipped because they cannot be placed in time.
 */
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

function openAiCapacityReport(
  windows: CapacityWindow[],
  checkedAt: string,
  authenticated: boolean,
): CapacityReport {
  return {
    harness: "pi",
    provider: "openai",
    generatedAt: checkedAt,
    authenticated,
    available: windows.length > 0 ? "yes" : "unknown",
    windows,
    creditsRemaining: null,
  };
}

/**
 * Builds the capacity report from merged day buckets: trailing-7-day and
 * current-UTC-day token usage. The platform is pay-as-you-go and exposes no
 * queryable limit, so windows report consumption only — no faked percentages.
 */
export function buildOpenAiReport(buckets: OpenAiUsageBucket[], checkedAt: string): CapacityReport {
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
  return openAiCapacityReport(windows, checkedAt, true);
}

async function fetchUsage(context: OpenAiRequestContext): Promise<unknown[] | number | null> {
  const fetcher = context.fetch ?? globalThis.fetch;
  const endSeconds = Math.floor(Date.parse(context.checkedAt) / 1000);
  const startSeconds = endSeconds - USAGE_WINDOW_DAYS * 24 * 60 * 60;
  const query = `start_time=${startSeconds}&end_time=${endSeconds}`;
  const payloads: unknown[] = [];
  for (const endpoint of OPENAI_USAGE_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), context.timeoutMs ?? 5000);
    let response: Response;
    try {
      response = await fetcher(`${OPENAI_USAGE_BASE_URL}/${endpoint}?${query}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${context.key}`,
        },
        signal: controller.signal,
      });
    } catch {
      throw new Error("OpenAI usage request failed");
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 401) return null;
    if (response.status === 403) return response.status;
    if (response.status !== 200) {
      throw new Error(`OpenAI usage request failed: HTTP ${response.status}`);
    }
    try {
      payloads.push(await response.json());
    } catch {
      throw new Error("OpenAI usage response is not valid JSON");
    }
  }
  return payloads;
}

async function verifyKey(context: OpenAiRequestContext): Promise<boolean> {
  const fetcher = context.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), context.timeoutMs ?? 5000);
  try {
    const response = await fetcher(OPENAI_MODELS_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${context.key}` },
      signal: controller.signal,
    });
    return response.status !== 401;
  } catch {
    throw new Error("OpenAI usage request failed");
  } finally {
    clearTimeout(timer);
  }
}

export async function probeOpenAiCapacity(options: OpenAiProbeOptions): Promise<CapacityReport> {
  const key = await resolveOpenAiApiKey(options);
  const probe: OpenAiProbeOptions & { key: string } = { ...options, key };
  const result = await fetchUsage(probe);
  if (result === null) {
    return openAiCapacityReport([], options.checkedAt, false);
  }
  if (typeof result === "number") {
    const authenticated = await verifyKey(probe);
    return openAiCapacityReport([], options.checkedAt, authenticated);
  }
  const buckets = result.flatMap(parseOpenAiUsage);
  return buildOpenAiReport(buckets, options.checkedAt);
}
