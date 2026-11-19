import type { Availability, CapacityWindow, ProviderCapacitySnapshot } from "../types.js";
import type { AntigravityOAuthCredential } from "../../harnesses/antigravity/credentials.js";

const FIVE_HOUR_MINUTES = 5 * 60;
const DAY_MINUTES = 24 * 60;
const WEEK_MINUTES = 7 * 24 * 60;
const MIN_PRINT_VERSION: readonly [number, number, number] = [1, 1, 11];
const CLOUD_CODE_LOAD_ASSIST_URL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
const CLOUD_CODE_QUOTA_SUMMARY_URL =
  "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary";
const CLOUD_CODE_CLIENT_METADATA = {
  ideType: "ANTIGRAVITY",
  platform: "PLATFORM_UNSPECIFIED",
  pluginType: "GEMINI",
};
const DEFAULT_REMOTE_LOAD_TIMEOUT_MS = 3_000;
const DEFAULT_REMOTE_SUMMARY_TIMEOUT_MS = 2_000;

type UnknownRecord = Record<string, unknown>;

export type AntigravityVersion = readonly [number, number, number];

export type AntigravityCliFailureKind =
  | "authentication_required"
  | "executable_not_found"
  | "unsupported_version"
  | "launch_failed"
  | "timed_out"
  | "output_too_large"
  | "network"
  | "eligibility_network"
  | "ineligible"
  | "exited";

export class AntigravityCliError extends Error {
  constructor(
    public readonly kind: AntigravityCliFailureKind,
    message: string,
    public readonly exitCode?: number,
  ) {
    super(message);
    this.name = "AntigravityCliError";
  }
}

const SIGN_IN_MARKERS = [
  "not logged in",
  "not signed in",
  "unauthenticated",
  "authentication required",
  "login required",
  "please log in",
  "please sign in",
  "sign in with google",
  "open the following url",
];

const ELIGIBILITY_MARKERS = [
  "eligibility check failed",
  "not eligible",
  "does not support google tos",
  "unsupported country",
  "unsupported region",
];

const NETWORK_MARKERS = [
  /\beof\b/,
  /\btimed out\b/,
  /\btimeout\b/,
  /\bdeadline exceeded\b/,
  /\bi\/o timeout\b/,
  /\bno such host\b/,
  /\bdns\b/,
  /\bconnection refused\b/,
  /\bconnection reset\b/,
  /\bnetwork is unreachable\b/,
  /\bunreachable\b/,
  /\bproxy\b/,
  /\bcertificate\b/,
  /\btls\b/,
  /\bssl\b/,
  /get "http/,
  /post "http/,
];

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseAntigravityVersion(output: string): AntigravityVersion | null {
  const match = /\bv?(\d+)\.(\d+)\.(\d+)\b/.exec(output);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isSupportedAntigravityVersion(version: AntigravityVersion): boolean {
  for (let i = 0; i < 3; i += 1) {
    if (version[i] > MIN_PRINT_VERSION[i]) return true;
    if (version[i] < MIN_PRINT_VERSION[i]) return false;
  }
  return true;
}

function parseRemainingFraction(bucket: UnknownRecord): number | null {
  const direct = finiteNumber(bucket.remaining_fraction ?? bucket.remainingFraction);
  if (direct !== null) return direct;

  const nested = record(bucket.remaining);
  if (!nested) return null;

  const nestedFraction = finiteNumber(nested.remaining_fraction ?? nested.remainingFraction);
  if (nestedFraction !== null) return nestedFraction;

  const oneofCase = nonEmptyString(nested.case);
  if (oneofCase === "remainingFraction" || oneofCase === "remaining_fraction") {
    return finiteNumber(nested.value);
  }
  return null;
}

function usedPercentFromRemaining(remainingFraction: number | null): number | null {
  if (remainingFraction === null) return null;
  const clamped = Math.max(0, Math.min(1, remainingFraction));
  return Math.round((1 - clamped) * 1000) / 10;
}

function parseResetTime(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const text = nonEmptyString(value);
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) return null;
    const ms = numeric > 1e12 ? numeric : numeric * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function parseCadence(
  windowText: string | null,
  bucketName: string,
  bucketId: string,
): { durationMinutes: number | null; shortLabel: string } {
  const candidates = [windowText, bucketName, bucketId]
    .filter((item): item is string => Boolean(item))
    .map((item) => item.toLowerCase());

  for (const candidate of candidates) {
    if (
      /(?:^|[^a-z0-9])(5h|5_hour|five_hour|five[- ]hour|5[- ]hour)(?:$|[^a-z0-9])/.test(candidate)
    ) {
      return { durationMinutes: FIVE_HOUR_MINUTES, shortLabel: "5h" };
    }
    if (/(?:^|[^a-z0-9])(weekly|7d|1w|week)(?:$|[^a-z0-9])/.test(candidate)) {
      return { durationMinutes: WEEK_MINUTES, shortLabel: "Weekly" };
    }
    if (/(?:^|[^a-z0-9])(daily|24h|1d|day)(?:$|[^a-z0-9])/.test(candidate)) {
      return { durationMinutes: DAY_MINUTES, shortLabel: "Daily" };
    }
  }
  return { durationMinutes: null, shortLabel: bucketName };
}

function deriveAvailability(windows: CapacityWindow[]): Availability {
  const measured = windows.filter((window) => window.usedPercent !== null);
  if (measured.length === 0) return "unknown";
  return measured.some((window) => (window.usedPercent as number) < 100) ? "yes" : "no";
}

export function parseAntigravityQuotaSummaryPayload(raw: unknown): ProviderCapacitySnapshot {
  const root = record(raw);
  const payload = record(root?.response) ?? record(root?.summary) ?? root;
  const groups = Array.isArray(payload?.groups) ? payload.groups : [];
  const windows: CapacityWindow[] = [];
  const seenIds = new Set<string>();

  for (const rawGroup of groups) {
    const group = record(rawGroup);
    if (!group) continue;
    const groupName =
      nonEmptyString(group.display_name ?? group.displayName ?? group.name) ?? "Quota";
    const buckets = Array.isArray(group.buckets) ? group.buckets : [];

    for (const rawBucket of buckets) {
      const bucket = record(rawBucket);
      if (!bucket || bucket.disabled === true) continue;

      const bucketId = nonEmptyString(bucket.bucket_id ?? bucket.bucketId ?? bucket.id);
      if (!bucketId) continue;

      const windowId = `antigravity:${bucketId}`;
      if (seenIds.has(windowId)) continue;
      seenIds.add(windowId);

      const bucketName =
        nonEmptyString(bucket.display_name ?? bucket.displayName ?? bucket.name) ?? bucketId;
      const windowText = nonEmptyString(bucket.window);
      const { durationMinutes, shortLabel } = parseCadence(windowText, bucketName, bucketId);
      const remainingFraction = parseRemainingFraction(bucket);
      const resetsAt = parseResetTime(bucket.reset_time ?? bucket.resetTime);

      windows.push({
        id: windowId,
        label: `${groupName} · ${shortLabel}`,
        durationMinutes,
        usedPercent: usedPercentFromRemaining(remainingFraction),
        resetsAt,
      });
    }
  }

  const hasKnownQuota = windows.some((window) => window.usedPercent !== null);
  if (windows.length === 0 || !hasKnownQuota) {
    throw new Error("Antigravity quota summary has no known quota");
  }

  return {
    authenticated: true,
    available: deriveAvailability(windows),
    windows,
    creditsRemaining: null,
  };
}

export function parseAntigravityUsageReport(raw: unknown): ProviderCapacitySnapshot {
  const root = record(raw);
  const command = record(root?.command);
  if (root?.status !== "SUCCESS" || command?.name !== "usage") {
    throw new Error("Unsuccessful Antigravity CLI usage report");
  }
  return parseAntigravityQuotaSummaryPayload(command.data);
}

export type AntigravityRemoteRequestOptions = {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

function antigravityHubUserAgent(): string {
  const platform = process.platform === "linux" ? "linux" : "darwin";
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  return `antigravity/hub/2.9.1 ${platform}/${arch}`;
}

async function postCloudCodeJson(
  url: string,
  accessToken: string,
  body: UnknownRecord,
  timeoutMs: number,
  fetchFn: typeof globalThis.fetch,
): Promise<unknown> {
  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": antigravityHubUserAgent(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== 200) {
    throw new Error(`Antigravity remote API failed: HTTP ${response.status}`);
  }
  return response.json();
}

function extractProjectId(raw: unknown): string | null {
  const root = record(raw);
  if (!root) return null;
  const project = root.cloudaicompanionProject ?? root.cloudaicompanion_project;
  const direct = nonEmptyString(project);
  if (direct) return direct;
  return nonEmptyString(record(project)?.id);
}

export async function fetchAntigravityRemoteCapacity(
  credential: AntigravityOAuthCredential,
  options: AntigravityRemoteRequestOptions = {},
): Promise<ProviderCapacitySnapshot> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  let projectId = credential.projectId;

  if (!projectId) {
    const loadAssist = await postCloudCodeJson(
      CLOUD_CODE_LOAD_ASSIST_URL,
      credential.accessToken,
      { metadata: CLOUD_CODE_CLIENT_METADATA },
      options.timeoutMs ?? DEFAULT_REMOTE_LOAD_TIMEOUT_MS,
      fetchFn,
    );
    projectId = extractProjectId(loadAssist);
  }

  const summaryBody: UnknownRecord = projectId ? { project: projectId } : {};
  const summary = await postCloudCodeJson(
    CLOUD_CODE_QUOTA_SUMMARY_URL,
    credential.accessToken,
    summaryBody,
    Math.min(
      options.timeoutMs ?? DEFAULT_REMOTE_SUMMARY_TIMEOUT_MS,
      DEFAULT_REMOTE_SUMMARY_TIMEOUT_MS,
    ),
    fetchFn,
  );
  return parseAntigravityQuotaSummaryPayload(summary);
}

export function classifyAntigravityExitFailure(
  exitCode: number,
  stderr: string,
): AntigravityCliError {
  const text = stderr.toLowerCase();
  if (SIGN_IN_MARKERS.some((marker) => text.includes(marker))) {
    return new AntigravityCliError(
      "authentication_required",
      "Antigravity CLI authentication required; run agy to sign in",
      exitCode,
    );
  }

  const eligibilityFailed = ELIGIBILITY_MARKERS.some((marker) => text.includes(marker));
  const networkFailed = NETWORK_MARKERS.some((pattern) => pattern.test(text));

  if (eligibilityFailed) {
    return networkFailed
      ? new AntigravityCliError(
          "eligibility_network",
          `agy exited ${exitCode}; the eligibility check failed on a network request (check network or proxy settings)`,
          exitCode,
        )
      : new AntigravityCliError(
          "ineligible",
          `agy exited ${exitCode}; the account is not eligible for Antigravity`,
          exitCode,
        );
  }

  if (networkFailed) {
    return new AntigravityCliError(
      "network",
      `agy exited ${exitCode}; a network request failed (check network or proxy settings)`,
      exitCode,
    );
  }

  return new AntigravityCliError("exited", `agy exited ${exitCode}`, exitCode);
}
