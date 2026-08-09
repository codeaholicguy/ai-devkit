import { describe, expect, it, vi } from 'vitest';
import { mapCodexRateLimits, probeCodexCapacity } from '../../../commands/capacity/providers/codex.js';

describe('Codex capacity mapping', () => {
  it('normalizes arbitrary windows, aliases, and unredeemed reset credits', () => {
    const result = mapCodexRateLimits({
      rateLimits: {
        limitId: 'codex',
        limitName: 'Codex',
        planType: 'pro',
        rateLimitReachedType: null,
        primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 1786273200 },
        secondary: { usedPercent: 61, windowDurationMins: 10080, resetsAt: 1786752000 }
      },
      rateLimitsByLimitId: {
        reviews: {
          limitId: 'reviews',
          limitName: 'Code reviews',
          primary: { usedPercent: 10, windowDurationMins: 1440, resetsAt: 1786320000 },
          secondary: null
        }
      },
      usageLimitResetCredits: { availableCount: 2 }
    }, { configured: true, installed: true, checkedAt: '2026-08-09T10:00:00.000Z' });

    expect(result.available).toBe('yes');
    expect(result.plan).toBe('pro');
    expect(result.windows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'codex:primary', durationMinutes: 300, remainingPercent: 80 }),
      expect.objectContaining({ id: 'codex:secondary', durationMinutes: 10080, remainingPercent: 39 }),
      expect.objectContaining({ id: 'reviews:primary', durationMinutes: 1440, scope: 'reviews' })
    ]));
    expect(result.aliases).toEqual({ dailyWindowId: 'reviews:primary', weeklyWindowId: 'codex:secondary' });
    expect(result.resetCredits).toEqual({ available: 2 });
  });

  it('does not turn missing capacity into available yes', () => {
    const result = mapCodexRateLimits({}, {
      configured: true,
      installed: true,
      checkedAt: '2026-08-09T10:00:00.000Z'
    });

    expect(result.available).toBe('unknown');
    expect(result.status).toBe('unknown');
    expect(result.windows).toEqual([]);
  });

  it('reports explicit exhaustion as unavailable without exposing response details', () => {
    const result = mapCodexRateLimits({
      rateLimits: { rateLimitReachedType: 'rate-limit-secret-detail', planType: 'team' }
    }, { configured: true, installed: true, checkedAt: '2026-08-09T10:00:00.000Z' });

    expect(result.available).toBe('no');
    expect(JSON.stringify(result)).not.toContain('rate-limit-secret-detail');
  });

  it('uses only app-server account methods and never invokes a model turn', async () => {
    const rpc = vi.fn(async () => ({
      rateLimits: {
        primary: { usedPercent: 5, windowDurationMins: 300, resetsAt: null }
      }
    }));

    const result = await probeCodexCapacity({
      configured: true,
      installed: true,
      checkedAt: '2026-08-09T10:00:00.000Z',
      rpc
    });

    expect(rpc).toHaveBeenCalledOnce();
    const messages = rpc.mock.calls[0][0];
    expect(messages.map(message => message.method)).toEqual([
      'initialize',
      'initialized',
      'account/rateLimits/read'
    ]);
    expect(JSON.stringify(messages)).not.toMatch(/model|prompt|turn/i);
    expect(result.available).toBe('yes');
  });

  it('redacts all transport failures', async () => {
    const result = await probeCodexCapacity({
      configured: true,
      installed: true,
      checkedAt: '2026-08-09T10:00:00.000Z',
      rpc: async () => { throw new Error('token=secret https://private.example/account/123'); }
    });

    expect(result.available).toBe('unknown');
    expect(result.error).toEqual({ code: 'codex-probe-failed', retryable: true });
    expect(JSON.stringify(result)).not.toMatch(/secret|private\.example|account\/123/);
  });
});
