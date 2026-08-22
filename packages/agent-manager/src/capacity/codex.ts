import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CapacityReport, CapacityWindow } from './types.js';

type CodexUsageSource = 'pat' | 'oauth' | 'cli';
type UsageSnapshot = { windows: CapacityWindow[]; creditsRemaining: number | null; source: CodexUsageSource };

type UnknownRecord = Record<string, unknown>;
type RpcMessage = { id?: number; method: string; params?: UnknownRecord };
type CliResponses = { rateLimits: unknown; account: unknown };
type CodexRpc = (messages: RpcMessage[]) => Promise<CliResponses>;

export const CODEX_APP_SERVER_ARGS = ['-s', 'read-only', '-a', 'untrusted', 'app-server'] as const;

type CodexProbeOptions = {
  installed: boolean;
  checkedAt: string;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
  fetch?: typeof globalThis.fetch;
  rpc?: CodexRpc;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
};

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function resetTime(value: unknown): string | null {
  const seconds = finiteNumber(value);
  if (seconds !== null) return new Date(seconds * 1000).toISOString();
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

function safeIdentifier(value: unknown): string | null {
  const candidate = nonEmptyText(value);
  if (!candidate || !/^[a-z][a-z0-9_-]{0,63}$/i.test(candidate)) return null;
  if (/(?:account|token|secret|key)[_-]?\d{6,}/i.test(candidate)) return null;
  return candidate;
}

export function resolveCodexAuthPath(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.CODEX_HOME || join(env.HOME || '', '.codex');
  return join(root, 'auth.json');
}

export function toRateWindow(
  value: unknown,
  id: string,
  label: string
): CapacityWindow | null {
  const input = record(value);
  if (!input) return null;
  const used = finiteNumber(input.used_percent);
  const seconds = finiteNumber(input.limit_window_seconds);
  return {
    id,
    label,
    durationMinutes: seconds === null ? null : seconds / 60,
    usedPercent: used,
    resetsAt: resetTime(input.reset_at)
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
      toRateWindow(windows.secondary_window, `${scope}:secondary`, `${scope} secondary`)
    ].filter((window): window is CapacityWindow => window !== null);
  });
}

export function parseUsage(raw: unknown, source: 'pat' | 'oauth'): UsageSnapshot {
  const response = record(raw) ?? {};
  const limits = record(response.rate_limit) ?? {};
  const credits = record(response.credits) ?? {};
  return {
    windows: [
      toRateWindow(limits.primary_window, 'session', 'Session'),
      toRateWindow(limits.secondary_window, 'weekly', 'Weekly'),
      ...extraWindows(response.additional_rate_limits)
    ].filter((window): window is CapacityWindow => window !== null),
    creditsRemaining: finiteNumber(credits.balance),
    source
  };
}

function cliWindow(value: unknown, id: string, label: string): CapacityWindow | null {
  const input = record(value);
  if (!input) return null;
  return {
    id,
    label,
    durationMinutes: finiteNumber(input.windowDurationMins),
    usedPercent: finiteNumber(input.usedPercent),
    resetsAt: resetTime(input.resetsAt)
  };
}

function cliSnapshotWindows(value: unknown, fallbackId: string): CapacityWindow[] {
  const snapshot = record(value);
  if (!snapshot) return [];
  const scope = safeIdentifier(snapshot.limitId) ?? safeIdentifier(fallbackId) ?? 'codex';
  return [
    cliWindow(snapshot.primary, `${scope}:primary`, `${scope} primary`),
    cliWindow(snapshot.secondary, `${scope}:secondary`, `${scope} secondary`)
  ].filter((item): item is CapacityWindow => item !== null);
}

export function parseCliUsage(raw: unknown): UsageSnapshot {
  const response = record(raw) ?? {};
  const primary = record(response.rateLimits);
  const windows = primary ? cliSnapshotWindows(primary, 'codex') : [];
  const buckets = record(response.rateLimitsByLimitId);
  if (buckets) {
    for (const [id, snapshot] of Object.entries(buckets)) windows.push(...cliSnapshotWindows(snapshot, id));
  }
  const unique = [...new Map(windows.map(window => [window.id, window])).values()];
  return { windows: unique, creditsRemaining: null, source: 'cli' };
}

function capacityFromSnapshot(snapshot: UsageSnapshot, context: CodexProbeOptions, raw?: unknown): CapacityReport {
  const hasUsage = snapshot.windows.some(window => window.usedPercent !== null);
  const rateLimits = record(record(raw)?.rateLimits);
  const reached = nonEmptyText(rateLimits?.rateLimitReachedType);
  const resetCredits = record(record(raw)?.rateLimitResetCredits) ?? record(record(raw)?.usageLimitResetCredits);
  return {
    provider: 'codex',
    generatedAt: context.checkedAt,
    authenticated: true,
    available: reached ? 'no' : hasUsage ? 'yes' : 'unknown',
    windows: snapshot.windows,
    creditsRemaining: snapshot.creditsRemaining ?? finiteNumber(resetCredits?.availableCount)
  };
}

function jwtExpiry(token: string): number | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    return finiteNumber(record(JSON.parse(Buffer.from(part, 'base64url').toString('utf8')))?.exp);
  } catch {
    return null;
  }
}

function staleOAuth(tokens: UnknownRecord, token: string, now: Date): boolean {
  const metadata = tokens.expires_at ?? tokens.expiresAt ?? tokens.expiry;
  let expiry: number | null = finiteNumber(metadata);
  if (typeof metadata === 'string') {
    const parsed = Date.parse(metadata);
    expiry = Number.isNaN(parsed) ? null : parsed / 1000;
  }
  expiry ??= jwtExpiry(token);
  return expiry !== null && expiry <= now.getTime() / 1000;
}

async function fetchJson(fetcher: typeof globalThis.fetch, url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(response.status === 401 ? 'unauthorized' : 'request failed');
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function apiSnapshot(
  token: string,
  accountId: string,
  source: 'pat' | 'oauth',
  options: CodexProbeOptions
): Promise<UsageSnapshot> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const raw = await fetchJson(fetcher, 'https://chatgpt.com/backend-api/wham/usage', {
    headers: { Authorization: `Bearer ${token}`, 'ChatGPT-Account-Id': accountId }
  }, options.timeoutMs ?? 5000);
  return parseUsage(raw, source);
}

function appServerRpc(messages: RpcMessage[], timeoutMs = 5000): Promise<CliResponses> {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', CODEX_APP_SERVER_ARGS, {
      stdio: ['pipe', 'pipe', 'ignore']
    });
    const results: Partial<CliResponses> = {};
    let buffer = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(results as CliResponses);
    };
    const timer = setTimeout(() => finish(new Error('codex probe timed out')), timeoutMs);
    child.once('error', () => finish(new Error('codex app-server unavailable')));
    child.once('exit', () => { if (!settled) finish(new Error('codex app-server exited')); });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      for (;;) {
        const newline = buffer.indexOf('\n');
        if (newline < 0) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let message: UnknownRecord;
        try { message = JSON.parse(line) as UnknownRecord; } catch { continue; }
        if (message.id === 1) {
          for (const request of messages.slice(1)) child.stdin.write(`${JSON.stringify(request)}\n`);
        } else if (message.id === 2) {
          if (message.error) finish(new Error('codex rate-limit method failed'));
          else results.rateLimits = message.result;
        } else if (message.id === 3) {
          if (message.error) finish(new Error('codex account method failed'));
          else results.account = message.result;
        }
        if ('rateLimits' in results && 'account' in results) finish();
      }
    });
    child.stdin.write(`${JSON.stringify(messages[0])}\n`);
  });
}

function unavailable(options: CodexProbeOptions): CapacityReport {
  return {
    provider: 'codex',
    generatedAt: options.checkedAt,
    authenticated: null,
    available: 'unknown',
    windows: [],
    creditsRemaining: null
  };
}

async function cliFallback(options: CodexProbeOptions): Promise<CapacityReport> {
  if (!options.installed) return unavailable(options);
  const messages: RpcMessage[] = [
    { id: 1, method: 'initialize', params: {
      clientInfo: { name: 'ai-devkit', title: null, version: '1' }, capabilities: null
    } },
    { method: 'initialized' },
    { id: 2, method: 'account/rateLimits/read' },
    { id: 3, method: 'account/read' }
  ];
  try {
    const rpc = options.rpc ?? (requests => appServerRpc(requests, options.timeoutMs));
    const response = await rpc(messages);
    const result = capacityFromSnapshot(parseCliUsage(response.rateLimits), options, response.rateLimits);
    const accountEnvelope = record(response.account);
    if (accountEnvelope && Object.hasOwn(accountEnvelope, 'account') && !record(accountEnvelope.account)) {
      result.authenticated = false;
      result.available = 'unknown';
    }
    return result;
  } catch {
    return unavailable(options);
  }
}

export async function probeCodexCapacity(options: CodexProbeOptions): Promise<CapacityReport> {
  let parsed: UnknownRecord | null = null;
  try {
    const contents = await (options.readFile ?? readFile)(resolveCodexAuthPath(options.env), 'utf8');
    parsed = record(JSON.parse(contents));
  } catch {
    return cliFallback(options);
  }

  const auth = parsed ?? {};
  const pat = nonEmptyText(auth.personal_access_token);
  if (pat) {
    try {
      const fetcher = options.fetch ?? globalThis.fetch;
      const whoami = record(await fetchJson(fetcher,
        'https://auth.openai.com/api/accounts/v1/user-auth-credential/whoami',
        { headers: { Authorization: `Bearer ${pat}` } }, options.timeoutMs ?? 5000));
      const accountId = nonEmptyText(whoami?.chatgpt_account_id);
      if (!accountId) throw new Error('account unavailable');
      return capacityFromSnapshot(await apiSnapshot(pat, accountId, 'pat', options), options);
    } catch {
      // Continue to a separately available OAuth credential before using the CLI.
    }
  }

  const tokens = record(auth.tokens);
  const accessToken = nonEmptyText(tokens?.access_token);
  const accountId = nonEmptyText(tokens?.account_id);
  if (tokens && accessToken && accountId && !staleOAuth(tokens, accessToken, (options.now ?? (() => new Date()))())) {
    try {
      return capacityFromSnapshot(await apiSnapshot(accessToken, accountId, 'oauth', options), options);
    } catch {
      return cliFallback(options);
    }
  }
  return cliFallback(options);
}
