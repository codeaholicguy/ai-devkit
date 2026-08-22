import { describe, expect, it, vi } from 'vitest';
import { getCodexCapacityReport } from '../../capacity/index.js';

const checkedAt = '2026-08-09T10:00:00.000Z';

describe('getCodexCapacityReport', () => {
  it('detects Codex configuration and installation before probing', async () => {
    const probe = vi.fn(async context => ({
      provider: 'codex', agentType: 'codex', ...context,
      authenticated: true, status: 'supported' as const, available: 'yes' as const,
      plan: 'pro', source: 'provider-cli' as const, windows: [],
      aliases: { dailyWindowId: null, weeklyWindowId: null }, warnings: []
    }));

    const report = await getCodexCapacityReport({
      now: () => new Date(checkedAt),
      homeDir: '/users/test',
      path: '/usr/bin:/opt/bin',
      exists: async target => target === '/users/test/.codex',
      access: async target => {
        if (target !== '/opt/bin/codex') throw new Error('missing');
      },
      probe
    });

    expect(probe).toHaveBeenCalledWith({ configured: true, installed: true, checkedAt });
    expect(report).toMatchObject({ schemaVersion: 1, generatedAt: checkedAt });
    expect(report.providers).toHaveLength(1);
  });

  it('redacts unexpected probe failures into a stable unknown result', async () => {
    const report = await getCodexCapacityReport({
      now: () => new Date(checkedAt),
      path: '',
      exists: async () => false,
      probe: async () => { throw new Error('private provider response'); }
    });

    expect(report.providers[0]).toMatchObject({
      provider: 'codex', status: 'unavailable', available: 'unknown', configured: false, installed: false
    });
    expect(JSON.stringify(report)).not.toContain('private provider response');
  });
});
