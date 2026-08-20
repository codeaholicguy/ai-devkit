import { describe, expect, it, vi } from 'vitest';
import {
  CODEX_APP_SERVER_ARGS,
  parseUsage,
  probeCodexCapacity,
  resolveCodexAuthPath,
  toRateWindow
} from '../../../commands/capacity/providers/codex.js';

const checkedAt = '2026-08-20T10:00:00.000Z';
const context = { configured: true, installed: true, checkedAt };

function apiUsage(overrides: Record<string, unknown> = {}) {
  return {
    rate_limit: {
      primary_window: { used_percent: 20, limit_window_seconds: 18_000, reset_at: 1_787_220_000 },
      secondary_window: { used_percent: 60, limit_window_seconds: 604_800, reset_at: 1_787_824_800 },
      ...overrides
    },
    credits: { balance: 12.5 },
    individual_limit: 100,
    additional_rate_limits: [{
      limit_name: 'reviews',
      rate_limit: {
        primary_window: { used_percent: 10, limit_window_seconds: 3_600, reset_at: 1_787_220_000 }
      }
    }]
  };
}

describe('Codex auth resolution', () => {
  it('uses CODEX_HOME before HOME', () => {
    expect(resolveCodexAuthPath({ CODEX_HOME: '/custom/codex', HOME: '/users/test' })).toBe('/custom/codex/auth.json');
  });

  it('falls back to ~/.codex/auth.json', () => {
    expect(resolveCodexAuthPath({ HOME: '/users/test' })).toBe('/users/test/.codex/auth.json');
  });
});

describe('Codex API usage mapping', () => {
  it('converts an API window without treating missing data as zero', () => {
    expect(toRateWindow({ used_percent: 25, limit_window_seconds: 18_000, reset_at: 1_787_220_000 }, 'session', 'Session')).toEqual({
      id: 'session', label: 'Session', durationMinutes: 300, usedPercent: 25,
      remainingPercent: 75, resetsAt: '2026-08-20T10:00:00.000Z', scope: null
    });
    expect(toRateWindow({}, 'session', 'Session')).toMatchObject({ usedPercent: null, remainingPercent: null });
  });

  it('maps session, weekly, credits, extra limits, and source', () => {
    const snapshot = parseUsage(apiUsage(), 'pat', checkedAt);
    expect(snapshot).toMatchObject({
      source: 'pat', creditsRemaining: 12.5, codexCreditLimit: 100, updatedAt: checkedAt,
      sessionLimit: { durationMinutes: 300, remainingPercent: 80 },
      weeklyLimit: { durationMinutes: 10080, remainingPercent: 40 }
    });
    expect(snapshot.extraRateWindows).toEqual([
      expect.objectContaining({ id: 'reviews:primary', remainingPercent: 90 })
    ]);
  });

  it.each([
    [{ individual_limit: 111 }, 111],
    [{ rate_limit: { individual_limit: 222 } }, 222],
    [{ spend_control: { individual_limit: 333 } }, 333]
  ])('uses the credit-limit fallback chain', (patch, expected) => {
    const usage = apiUsage();
    delete (usage as { individual_limit?: number }).individual_limit;
    const input = { ...usage, ...patch, rate_limit: { ...usage.rate_limit, ...('rate_limit' in patch ? patch.rate_limit : {}) } };
    expect(parseUsage(input, 'oauth', checkedAt).codexCreditLimit).toBe(expected);
  });

  it('represents missing limits as unavailable rather than zero', () => {
    const snapshot = parseUsage({ credits: {} }, 'oauth', checkedAt);
    expect(snapshot.sessionLimit).toBeNull();
    expect(snapshot.weeklyLimit).toBeNull();
    expect(snapshot.creditsRemaining).toBeNull();
  });
});

describe('tiered Codex probing', () => {
  it('selects PAT, calls whoami then usage, and never invokes the CLI', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ chatgpt_account_id: 'acct-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(apiUsage()), { status: 200 }));
    const rpc = vi.fn();
    const result = await probeCodexCapacity({
      ...context, readFile: async () => JSON.stringify({
        personal_access_token: 'pat-secret',
        tokens: { access_token: 'ignored-oauth', account_id: 'ignored-account' }
      }), fetch, rpc
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe('https://auth.openai.com/api/accounts/v1/user-auth-credential/whoami');
    expect(fetch.mock.calls[1][0]).toBe('https://chatgpt.com/backend-api/wham/usage');
    expect(fetch.mock.calls[1][1].headers).toMatchObject({ Authorization: 'Bearer pat-secret', 'ChatGPT-Account-Id': 'acct-1' });
    expect(rpc).not.toHaveBeenCalled();
    expect(result).toMatchObject({ source: 'provider-api', available: 'yes', usage: { source: 'pat' } });
  });

  it('selects a fresh OAuth token without calling whoami', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(apiUsage()), { status: 200 }));
    const result = await probeCodexCapacity({
      ...context,
      readFile: async () => JSON.stringify({ tokens: { access_token: 'oauth-secret', account_id: 'acct-2', expires_at: 1_800_000_000 } }),
      fetch,
      now: () => new Date('2026-08-20T10:00:00.000Z')
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer oauth-secret', 'ChatGPT-Account-Id': 'acct-2' });
    expect(result.usage?.source).toBe('oauth');
  });

  it.each([
    ['missing auth file', async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }],
    ['stale OAuth token', async () => JSON.stringify({ tokens: { access_token: 'stale-secret', account_id: 'acct', expires_at: 1 } })],
    ['OAuth 401', async () => JSON.stringify({ tokens: { access_token: 'oauth-secret', account_id: 'acct', expires_at: 1_800_000_000 } })]
  ])('falls back to the CLI for %s', async (name, readFile) => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: name === 'OAuth 401' ? 401 : 200 }));
    const rpc = vi.fn(async () => ({
      rateLimits: { rateLimits: { primary: { usedPercent: 5, windowDurationMins: 300, resetsAt: null } } },
      account: { account: { type: 'chatgpt' } }
    }));
    const result = await probeCodexCapacity({ ...context, readFile, fetch, rpc, now: () => new Date(checkedAt) });
    expect(rpc).toHaveBeenCalledOnce();
    expect(result.usage?.source).toBe('cli');
  });

  it('falls back to CLI if PAT requests fail', async () => {
    const rpc = vi.fn(async () => ({ rateLimits: {}, account: { account: null } }));
    const result = await probeCodexCapacity({
      ...context,
      readFile: async () => JSON.stringify({ personal_access_token: 'pat-secret' }),
      fetch: vi.fn().mockRejectedValue(new Error('network failure pat-secret')),
      rpc
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(result.available).toBe('unknown');
  });

  it('tries fresh OAuth after a PAT request fails', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error('PAT failed'))
      .mockResolvedValueOnce(new Response(JSON.stringify(apiUsage()), { status: 200 }));
    const rpc = vi.fn();
    const result = await probeCodexCapacity({
      ...context,
      readFile: async () => JSON.stringify({
        personal_access_token: 'pat-secret',
        tokens: { access_token: 'oauth-secret', account_id: 'acct', expires_at: 1_800_000_000 }
      }),
      fetch,
      rpc,
      now: () => new Date(checkedAt)
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.usage?.source).toBe('oauth');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses hardened read-only app-server arguments and both account methods', async () => {
    const rpc = vi.fn(async () => ({
      rateLimits: { rateLimits: { primary: { usedPercent: 5, windowDurationMins: 300, resetsAt: null } } },
      account: { account: { type: 'chatgpt' } }
    }));
    await probeCodexCapacity({ ...context, readFile: async () => '{}', rpc });
    const messages = rpc.mock.calls[0][0];
    expect(messages.map(message => message.method)).toEqual([
      'initialize', 'initialized', 'account/rateLimits/read', 'account/read'
    ]);
    expect(JSON.stringify(messages)).not.toMatch(/prompt|turn\/start/);
    expect(CODEX_APP_SERVER_ARGS).toEqual(['-s', 'read-only', '-a', 'untrusted', 'app-server']);
  });

  it('uses account/read to distinguish logged-out CLI state', async () => {
    const result = await probeCodexCapacity({
      ...context,
      readFile: async () => '{}',
      rpc: async () => ({ rateLimits: {}, account: { account: null } })
    });
    expect(result).toMatchObject({ authenticated: false, status: 'unauthenticated', available: 'unknown' });
  });

  it('never exposes tokens or raw auth content through failures', async () => {
    const secrets = ['pat-secret-value', 'oauth-secret-value', 'refresh-secret-value'];
    const result = await probeCodexCapacity({
      ...context,
      readFile: async () => JSON.stringify({
        personal_access_token: secrets[0],
        tokens: { access_token: secrets[1], refresh_token: secrets[2] }
      }),
      fetch: vi.fn().mockRejectedValue(new Error(secrets.join(' '))),
      rpc: async () => { throw new Error(secrets.join(' ')); }
    });
    const output = JSON.stringify(result);
    for (const secret of secrets) expect(output).not.toContain(secret);
  });
});
