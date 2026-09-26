import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { Availability, CapacityReport, CapacityWindow } from "./types.js";

const execFileAsync = promisify(execFile);

export type ClaudeCapacityOptions = {
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  now?: () => Date;
  cwd?: string;
  platform?: NodeJS.Platform;
  keychainRead?: (service: string) => Promise<string | null>;
};

export type ClaudeProbeOptions = ClaudeCapacityOptions & {
  checkedAt: string;
};

const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_KEYCHAIN_SERVICE = "Claude Code-credentials";
const SESSION_DURATION_MINUTES = 5 * 60;
const WEEK_DURATION_MINUTES = 7 * 24 * 60;

type Credential = { token: string | null; expired: boolean };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function percent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function credentialsPath(options: ClaudeProbeOptions): string {
  const env = options.env ?? process.env;
  const configured = nonEmptyText(env.CLAUDE_CONFIG_DIR);
  if (configured) {
    const profileRoot = isAbsolute(configured)
      ? configured
      : resolve(options.cwd ?? process.cwd(), configured);
    return join(profileRoot, ".credentials.json");
  }
  return join(env.HOME || homedir(), ".claude", ".credentials.json");
}

function credentialFromPayload(payload: string | null, now: Date): Credential {
  if (!payload) return { token: null, expired: false };
  try {
    return credentialFromRoot(record(JSON.parse(payload)), now);
  } catch {
    return { token: null, expired: false };
  }
}

async function readProfileCredential(options: ClaudeProbeOptions, now: Date): Promise<Credential> {
  try {
    const payload = await (options.readFile ?? readFile)(credentialsPath(options), "utf8");
    return credentialFromPayload(payload, now);
  } catch {
    return { token: null, expired: false };
  }
}

async function readKeychainCredential(options: ClaudeProbeOptions, now: Date): Promise<Credential> {
  const env = options.env ?? process.env;
  const usesDefaultProfile = !nonEmptyText(env.CLAUDE_CONFIG_DIR);
  if (!usesDefaultProfile || (options.platform ?? process.platform) !== "darwin") {
    return { token: null, expired: false };
  }
  try {
    const payload = await (options.keychainRead ?? readClaudeKeychain)(CLAUDE_KEYCHAIN_SERVICE);
    return credentialFromPayload(payload, now);
  } catch {
    return { token: null, expired: false };
  }
}

async function resolveToken(options: ClaudeProbeOptions): Promise<string> {
  const env = options.env ?? process.env;
  const environmentToken = nonEmptyText(env.CLAUDE_CODE_OAUTH_TOKEN);
  if (environmentToken) return environmentToken;

  const now = options.now?.() ?? new Date();
  const profileCredential = await readProfileCredential(options, now);
  if (profileCredential.token) return profileCredential.token;

  const keychainCredential = await readKeychainCredential(options, now);
  if (keychainCredential.token) return keychainCredential.token;
  if (profileCredential.expired || keychainCredential.expired) {
    throw new Error("Claude OAuth credentials expired");
  }
  throw new Error("Claude OAuth credentials not found or malformed");
}

function credentialFromRoot(root: Record<string, unknown> | null, now: Date): Credential {
  const oauth = record(root?.claudeAiOauth);
  const token = nonEmptyText(oauth?.accessToken);
  if (!token) return { token: null, expired: false };
  const expired =
    typeof oauth?.expiresAt === "number" &&
    Number.isFinite(oauth.expiresAt) &&
    oauth.expiresAt <= now.getTime();
  return { token: expired ? null : token, expired };
}

async function readClaudeKeychain(service: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/security",
      ["find-generic-password", "-s", service, "-w"],
      { encoding: "utf8", timeout: 1500, maxBuffer: 1024 * 1024 },
    );
    return nonEmptyText(stdout);
  } catch {
    return null;
  }
}

function resetTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  return Number.isNaN(milliseconds) ? null : new Date(milliseconds).toISOString();
}

function usageWindow(
  value: unknown,
  id: string,
  label: string,
  durationMinutes: number,
): CapacityWindow | null {
  const input = record(value);
  if (!input) return null;
  return {
    id,
    label,
    durationMinutes,
    usedPercent: percent(input.utilization),
    resetsAt: resetTime(input.resets_at),
  };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function scopedWindows(value: unknown): CapacityWindow[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const windows: CapacityWindow[] = [];
  for (const entry of value) {
    const limit = record(entry);
    const model = record(record(limit?.scope)?.model);
    const name = nonEmptyText(model?.display_name);
    const identity = nonEmptyText(model?.id) ?? name;
    if (limit?.kind !== "weekly_scoped" || limit.group !== "weekly" || !name || !identity) {
      continue;
    }
    const modelSlug = slug(identity);
    if (!modelSlug || modelSlug === "all-models" || modelSlug.endsWith("-all-models")) {
      continue;
    }
    const id = `claude:weekly:${modelSlug}`;
    if (seen.has(id)) continue;
    seen.add(id);
    windows.push({
      id,
      label: `${name} weekly`,
      durationMinutes: WEEK_DURATION_MINUTES,
      usedPercent: percent(limit.percent),
      resetsAt: resetTime(limit.resets_at),
    });
  }
  return windows;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extraUsageWindow(value: unknown): CapacityWindow | null {
  const extra = record(value);
  if (!extra || extra.is_enabled !== true) return null;
  const limitMinor = finiteNumber(extra.monthly_limit);
  const usedMinor = finiteNumber(extra.used_credits);
  if (limitMinor === null || usedMinor === null) return null;
  const total = limitMinor / 100;
  const current = usedMinor / 100;
  const currency = nonEmptyText(extra.currency)?.toUpperCase() ?? "USD";
  return {
    id: "claude:extra-usage",
    label: `Extra usage · ${currency}`,
    limitType: "CREDIT_LIMIT",
    durationMinutes: null,
    usedPercent:
      percent(extra.utilization) ??
      (total > 0 ? Math.max(0, Math.min(100, (current / total) * 100)) : null),
    resetsAt: null,
    total,
    current,
    remaining: Math.max(0, total - current),
  };
}

function availability(windows: CapacityWindow[]): Availability {
  const known = windows.flatMap((window) =>
    window.usedPercent === null ? [] : [window.usedPercent],
  );
  if (known.length === 0) return "unknown";
  return known.some((used) => used < 100) ? "yes" : "no";
}

function retryAfterTime(response: Response, now: Date): string | null {
  const raw = response.headers.get("Retry-After")?.trim();
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return new Date(now.getTime() + seconds * 1000).toISOString();
  }
  const milliseconds = Date.parse(raw);
  return Number.isNaN(milliseconds) ? null : new Date(milliseconds).toISOString();
}

export function parseClaudeUsage(raw: unknown, checkedAt: string): CapacityReport {
  const input = record(raw);
  if (!input) throw new Error("Claude usage response is malformed");
  const windows = [
    usageWindow(input.five_hour, "session", "Session", SESSION_DURATION_MINUTES),
    usageWindow(input.seven_day, "weekly", "Weekly", WEEK_DURATION_MINUTES),
    usageWindow(
      input.seven_day_sonnet,
      "claude:sonnet:weekly",
      "Sonnet weekly",
      WEEK_DURATION_MINUTES,
    ),
    usageWindow(input.seven_day_opus, "claude:opus:weekly", "Opus weekly", WEEK_DURATION_MINUTES),
    ...scopedWindows(input.limits),
    extraUsageWindow(input.extra_usage),
  ].filter((window): window is CapacityWindow => window !== null);
  return {
    harness: "claude",
    provider: "anthropic",
    generatedAt: checkedAt,
    authenticated: true,
    available: availability(windows),
    windows,
    creditsRemaining: null,
  };
}

export async function probeClaudeCapacity(options: ClaudeProbeOptions): Promise<CapacityReport> {
  const token = await resolveToken(options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  let response: Response;
  try {
    response = await (options.fetch ?? globalThis.fetch)(CLAUDE_USAGE_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "claude-code/2.1.0",
        "anthropic-beta": "oauth-2025-04-20",
      },
      signal: controller.signal,
    });
  } catch {
    throw new Error("Claude OAuth usage request failed");
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401) {
    throw new Error("Claude OAuth request unauthorized (HTTP 401)");
  }
  if (response.status === 403) {
    throw new Error("Claude OAuth request forbidden (HTTP 403)");
  }
  if (response.status === 429) {
    const retryAt = retryAfterTime(response, options.now?.() ?? new Date());
    throw new Error(
      retryAt
        ? `Claude OAuth usage rate limited until ${retryAt}`
        : "Claude OAuth usage rate limited (HTTP 429)",
    );
  }
  if (!response.ok) {
    throw new Error(`Claude OAuth usage request failed (HTTP ${response.status})`);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error("Claude usage response is malformed");
  }
  return parseClaudeUsage(raw, options.checkedAt);
}
