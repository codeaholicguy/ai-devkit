import { describe, expect, it, vi } from 'vitest';
import { getCodexCapacityReport } from '../../capacity/index.js';

const checkedAt = '2026-08-09T10:00:00.000Z';

describe('getCodexCapacityReport', () => {
  it('checks Codex installation before probing', async () => {
    const probe = vi.fn(async context => ({
      provider: 'codex', generatedAt: context.checkedAt,
      authenticated: true, available: 'yes' as const, windows: [], creditsRemaining: null
    }));

    const report = await getCodexCapacityReport({
      now: () => new Date(checkedAt),
      path: '/usr/bin:/opt/bin',
      access: async target => {
        if (target !== '/opt/bin/codex') throw new Error('missing');
      },
      probe
    });

    expect(probe).toHaveBeenCalledWith({ installed: true, checkedAt });
    expect(report).toMatchObject({ provider: 'codex', generatedAt: checkedAt, available: 'yes' });
  });

  it('redacts unexpected probe failures into a stable unknown result', async () => {
    const report = await getCodexCapacityReport({
      now: () => new Date(checkedAt),
      path: '',
      probe: async () => { throw new Error('private provider response'); }
    });

    expect(report).toMatchObject({
      provider: 'codex', available: 'unknown', authenticated: null, windows: []
    });
    expect(JSON.stringify(report)).not.toContain('private provider response');
  });
});
