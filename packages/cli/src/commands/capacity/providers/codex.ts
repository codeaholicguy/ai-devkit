import { spawn } from 'node:child_process';
import type { CapacityWindow, ProviderCapacity } from '../types.js';

type UnknownRecord = Record<string, unknown>;

type CodexMappingContext = {
  configured: boolean;
  installed: boolean;
  checkedAt: string;
};

type RpcMessage = { id?: number; method: string; params?: UnknownRecord };
type CodexRpc = (messages: RpcMessage[]) => Promise<unknown>;

type CodexProbeOptions = CodexMappingContext & {
  rpc?: CodexRpc;
  timeoutMs?: number;
};

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function safeIdentifier(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate || !/^[a-z][a-z0-9_-]{0,63}$/i.test(candidate)) return null;
  if (/(?:account|token|secret|key)[_-]?\d{6,}/i.test(candidate)) return null;
  return candidate;
}

function safeLabel(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate || candidate.length > 80 || !/^[a-z0-9 _-]+$/i.test(candidate)) return null;
  if (/(?:account|token|secret|key)[_-]?\d{6,}/i.test(candidate)) return null;
  return candidate;
}

function resetTime(value: unknown): string | null {
  const seconds = finiteNumber(value);
  if (seconds !== null) return new Date(seconds * 1000).toISOString();
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

function windowFrom(value: unknown, id: string, label: string, scope: string | null): CapacityWindow | null {
  const input = record(value);
  if (!input) return null;
  const used = finiteNumber(input.usedPercent);
  const duration = finiteNumber(input.windowDurationMins);
  return {
    id,
    label,
    durationMinutes: duration,
    usedPercent: used,
    remainingPercent: used === null ? null : Math.max(0, Math.min(100, 100 - used)),
    resetsAt: resetTime(input.resetsAt),
    scope
  };
}

function snapshotWindows(value: unknown, fallbackId: string): CapacityWindow[] {
  const snapshot = record(value);
  if (!snapshot) return [];
  const scope = safeIdentifier(snapshot.limitId) ?? safeIdentifier(fallbackId) ?? 'codex';
  const name = safeLabel(snapshot.limitName) ?? scope;
  return [
    windowFrom(snapshot.primary, `${scope}:primary`, `${name} primary`, scope),
    windowFrom(snapshot.secondary, `${scope}:secondary`, `${name} secondary`, scope)
  ].filter((item): item is CapacityWindow => item !== null);
}

function aliasFor(windows: CapacityWindow[], target: number, tolerance: number): string | null {
  return windows.find(window =>
    window.durationMinutes !== null && Math.abs(window.durationMinutes - target) <= tolerance
  )?.id ?? null;
}

export function mapCodexRateLimits(raw: unknown, context: CodexMappingContext): ProviderCapacity {
  const response = record(raw) ?? {};
  const primarySnapshot = record(response.rateLimits);
  const windows = snapshotWindows(primarySnapshot, 'codex');
  const buckets = record(response.rateLimitsByLimitId);
  if (buckets) {
    for (const [id, snapshot] of Object.entries(buckets)) {
      windows.push(...snapshotWindows(snapshot, id));
    }
  }
  const normalizedWindows = [...new Map(windows.map(window => [window.id, window])).values()];
  const reached = text(primarySnapshot?.rateLimitReachedType);
  const resetCredits = record(response.rateLimitResetCredits) ?? record(response.usageLimitResetCredits);
  const availableCount = finiteNumber(resetCredits?.availableCount);
  const hasCapacity = normalizedWindows.some(window => window.remainingPercent !== null);

  return {
    provider: 'codex',
    agentType: 'codex',
    configured: context.configured,
    installed: context.installed,
    authenticated: true,
    status: reached || hasCapacity ? 'supported' : 'unknown',
    available: reached ? 'no' : hasCapacity ? 'yes' : 'unknown',
    plan: text(primarySnapshot?.planType),
    checkedAt: context.checkedAt,
    source: 'provider-cli',
    windows: normalizedWindows,
    aliases: {
      dailyWindowId: aliasFor(normalizedWindows, 1440, 120),
      weeklyWindowId: aliasFor(normalizedWindows, 10080, 720)
    },
    resetCredits: { available: availableCount },
    warnings: hasCapacity || reached ? [] : [{
      code: 'capacity-unavailable',
      message: 'Codex did not return authoritative capacity windows.'
    }]
  };
}

function appServerRpc(messages: RpcMessage[], timeoutMs = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'ignore'] });
    let buffer = '';
    let settled = false;
    const finish = (error?: Error, result?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('codex probe timed out')), timeoutMs);
    child.once('error', () => finish(new Error('codex app-server unavailable')));
    child.once('exit', code => {
      if (!settled) finish(new Error(`codex app-server exited (${code ?? 'unknown'})`));
    });
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
        try {
          message = JSON.parse(line) as UnknownRecord;
        } catch {
          continue;
        }
        if (message.id === 1) {
          for (const request of messages.slice(1)) child.stdin.write(`${JSON.stringify(request)}\n`);
        }
        if (message.id === 2) {
          if (message.error) finish(new Error('codex rate-limit method failed'));
          else finish(undefined, message.result);
        }
      }
    });
    child.stdin.write(`${JSON.stringify(messages[0])}\n`);
  });
}

export async function probeCodexCapacity(options: CodexProbeOptions): Promise<ProviderCapacity> {
  if (!options.installed) {
    return {
      provider: 'codex', agentType: 'codex', configured: options.configured, installed: false,
      authenticated: null, status: 'unavailable', available: 'unknown', plan: null,
      checkedAt: options.checkedAt, source: 'none', windows: [],
      aliases: { dailyWindowId: null, weeklyWindowId: null }, resetCredits: { available: null },
      warnings: [{ code: 'cli-not-installed', message: 'Codex CLI is not installed.' }]
    };
  }
  const messages: RpcMessage[] = [
    { id: 1, method: 'initialize', params: {
      clientInfo: { name: 'ai-devkit', title: null, version: '1' }, capabilities: null
    } },
    { method: 'initialized' },
    { id: 2, method: 'account/rateLimits/read' }
  ];
  try {
    const rpc = options.rpc ?? (requests => appServerRpc(requests, options.timeoutMs));
    return mapCodexRateLimits(await rpc(messages), options);
  } catch {
    return {
      provider: 'codex', agentType: 'codex', configured: options.configured, installed: true,
      authenticated: null, status: 'unknown', available: 'unknown', plan: null,
      checkedAt: options.checkedAt, source: 'none', windows: [],
      aliases: { dailyWindowId: null, weeklyWindowId: null }, resetCredits: { available: null },
      warnings: [{ code: 'probe-failed', message: 'Codex capacity could not be read safely.' }],
      error: { code: 'codex-probe-failed', retryable: true }
    };
  }
}
