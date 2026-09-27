import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseWhamUsage } from "./wham.js";
import type { CapacityReport, CapacityWindow } from "./types.js";

const OPENAI_USAGE_BASE_URL = "https://api.openai.com/v1/organization/usage";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";
const WHAM_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const OPENAI_USAGE_ENDPOINTS = ["completions", "responses"] as const;
const USAGE_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const MISSING_API_KEY_MESSAGE =
  "OpenAI credentials not found; set OPENAI_API_KEY, configure the Pi openai provider, or log in to OpenAI via Pi";
const EPOCH_MS_FLOOR = 1e12;

export type OpenAiUsageBucket = { startMs: number; tokens: number };
type UnknownRecord = Record<string, unknown>;

/**
 * Resolved OpenAI credential: a platform API key (env or Pi `openai` entry)
 * or the OAuth login Pi stores as `openai-codex` for ChatGPT-backed access.
 */
export type OpenAiCredential =
  | { kind: "platform"; key: string }
  | { kind: "oauth"; access: string; accountId: string; expiresMs: number | null };

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
type OAuthCredential = Extract<OpenAiCredential, { kind: "oauth" }>;

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

/** Pi stores `expires` in epoch milliseconds, codex-style tokens use seconds. */
function toEpochMs(value: unknown): number | null {
  const raw = finiteNumber(value);
  if (raw === null || raw <= 0) return null;
  return raw > EPOCH_MS_FLOOR ? raw : raw * 1000;
}

async function readPiAuthRoot(options: OpenAiCredentialOptions): Promise<UnknownRecord> {
  const env = options.env ?? process.env;
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
  return parsed;
}

/**
 * Resolves the OpenAI credential in priority order: `OPENAI_API_KEY` env,
 * then the Pi `openai` platform-key entry, then the Pi `openai-codex` OAuth
 * login written by `pi login` (no manual setup required).
 */
export async function resolveOpenAiCredential(
  options: OpenAiCredentialOptions = {},
): Promise<OpenAiCredential> {
  const env = options.env ?? process.env;
  const environmentKey = nonEmptyText(env.OPENAI_API_KEY);
  if (environmentKey) return { kind: "platform", key: environmentKey };

  const parsed = await readPiAuthRoot(options);

  const platform = record(parsed.openai);
  if (platform) {
    const key = platform.type === "api_key" ? nonEmptyText(platform.key) : null;
    if (!key) {
      throw new Error("OpenAI Pi auth file has a malformed openai credential");
    }
    return { kind: "platform", key };
  }

  const oauth = record(parsed["openai-codex"]);
  const access = oauth?.type === "oauth" ? nonEmptyText(oauth.access) : null;
  const accountId = nonEmptyText(oauth?.accountId);
  if (oauth && access && accountId) {
    return { kind: "oauth", access, accountId, expiresMs: toEpochMs(oauth.expires) };
  }
  throw new Error(MISSING_API_KEY_MESSAGE);
}

export async function resolveOpenAiApiKey(options: OpenAiCredentialOptions = {}): Promise<string> {
  const credential = await resolveOpenAiCredential(options);
  if (credential.kind === "platform") return credential.key;
  throw new Error(MISSING_API_KEY_MESSAGE);
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
  const credential = await resolveOpenAiCredential(options);
  if (credential.kind === "oauth") {
    return probeOpenAiOauthCapacity(credential, options);
  }
  const probe: OpenAiProbeOptions & { key: string } = { ...options, key: credential.key };
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

/** Mirrors codex.ts: JWT `exp` (epoch seconds) as expiry fallback. */
function jwtExpiryMs(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const exp = finiteNumber(
      record(JSON.parse(Buffer.from(part, "base64url").toString("utf8")))?.exp,
    );
    return exp === null ? null : exp * 1000;
  } catch {
    return null;
  }
}

function oauthExpired(credential: OAuthCredential, nowMs: number): boolean {
  const expiryMs = credential.expiresMs ?? jwtExpiryMs(credential.access);
  return expiryMs !== null && expiryMs <= nowMs;
}

async function fetchWhamUsage(
  credential: OAuthCredential,
  options: OpenAiProbeOptions,
): Promise<unknown | null> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  let response: Response;
  try {
    response = await fetcher(WHAM_USAGE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credential.access}`,
        "ChatGPT-Account-Id": credential.accountId,
      },
      signal: controller.signal,
    });
  } catch {
    throw new Error("OpenAI usage request failed");
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401 || response.status === 403) return null;
  if (response.status !== 200) {
    throw new Error(`OpenAI usage request failed: HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("OpenAI usage response is not valid JSON");
  }
}

/**
 * OAuth path for Pi's OpenAI login: consumes the same wham/usage endpoint as
 * the codex harness. Stale logins are never fetched (no refresh, matching
 * codex.ts); they render as authenticated-but-stale instead.
 */
async function probeOpenAiOauthCapacity(
  credential: OAuthCredential,
  options: OpenAiProbeOptions,
): Promise<CapacityReport> {
  const staleReport: CapacityReport = {
    harness: "pi",
    provider: "openai",
    generatedAt: options.checkedAt,
    authenticated: true,
    available: "unknown",
    windows: [],
    creditsRemaining: null,
  };
  const nowMs = Date.parse(options.checkedAt);
  if (Number.isNaN(nowMs) || oauthExpired(credential, nowMs)) return staleReport;
  const raw = await fetchWhamUsage(credential, options);
  if (raw === null) {
    return { ...staleReport, authenticated: false };
  }
  const snapshot = parseWhamUsage(raw);
  const hasUsage = snapshot.windows.some((window) => window.usedPercent !== null);
  return {
    ...staleReport,
    available: hasUsage ? "yes" : "unknown",
    windows: snapshot.windows,
    creditsRemaining: snapshot.creditsRemaining,
  };
}
