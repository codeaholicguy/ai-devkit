import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProviderCapacity } from '../types.js';

const execFileAsync = promisify(execFile);
type UnknownRecord = Record<string, unknown>;
type ClaudeContext = { configured: boolean; installed: boolean; checkedAt: string };
type ClaudeOptions = ClaudeContext & { authStatus?: () => Promise<unknown>; timeoutMs?: number };

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

async function defaultAuthStatus(timeoutMs: number): Promise<unknown> {
  const { stdout } = await execFileAsync('claude', ['auth', 'status', '--json'], {
    timeout: timeoutMs, maxBuffer: 64 * 1024, encoding: 'utf8'
  });
  return JSON.parse(stdout);
}

function base(context: ClaudeContext): ProviderCapacity {
  return {
    provider: 'claude', agentType: 'claude', configured: context.configured,
    installed: context.installed, authenticated: null, status: 'unknown',
    available: 'unknown', plan: null, checkedAt: context.checkedAt, source: 'none',
    windows: [], aliases: { dailyWindowId: null, weeklyWindowId: null }, warnings: []
  };
}

export async function probeClaudeCapacity(options: ClaudeOptions): Promise<ProviderCapacity> {
  const result = base(options);
  if (!options.installed) {
    result.status = 'unavailable';
    result.warnings.push({ code: 'cli-not-installed', message: 'Claude CLI is not installed.' });
    return result;
  }
  try {
    const raw = await (options.authStatus ?? (() => defaultAuthStatus(options.timeoutMs ?? 3000)))();
    const auth = record(raw);
    const authenticated = auth?.loggedIn === true || auth?.authenticated === true;
    result.authenticated = authenticated;
    result.status = authenticated ? 'supported' : 'unauthenticated';
    result.source = 'provider-cli';
    result.plan = typeof auth?.subscriptionType === 'string' ? auth.subscriptionType : null;
    result.warnings.push({
      code: 'live-usage-unavailable',
      message: 'Claude live capacity is unknown because no safe provider-owned usage command is available.'
    });
    return result;
  } catch {
    result.error = { code: 'claude-auth-probe-failed', retryable: true };
    result.warnings.push({ code: 'probe-failed', message: 'Claude authentication could not be checked safely.' });
    return result;
  }
}
