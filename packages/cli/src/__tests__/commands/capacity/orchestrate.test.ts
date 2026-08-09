import { describe, expect, it, vi } from 'vitest';
import { getCapacityReport } from '../../../commands/capacity/orchestrate.js';
import { buildUnsupportedCapacity } from '../../../commands/capacity/providers/stub.js';

const now = () => new Date('2026-08-09T10:00:00.000Z');

describe('capacity orchestration', () => {
  it('probes only configured providers by default, in parallel, and preserves partial results', async () => {
    const started: string[] = [];
    const report = await getCapacityReport({}, {
      now,
      detectConfigured: async () => ['codex', 'gemini'],
      isInstalled: async provider => provider === 'codex',
      probe: async (provider, context) => {
        started.push(provider);
        if (provider === 'codex') throw new Error('private raw response');
        return [buildUnsupportedCapacity(provider, context)];
      },
      readCache: async () => null,
      writeCache: async () => undefined
    });

    expect(started.sort()).toEqual(['codex', 'gemini']);
    expect(report.providers.map(provider => provider.provider)).toEqual(['codex', 'gemini']);
    expect(report.providers[0]).toMatchObject({ available: 'unknown', error: { code: 'probe-failed' } });
    expect(JSON.stringify(report)).not.toContain('private raw response');
  });

  it('uses a fresh cache unless --refresh is requested', async () => {
    const cached = {
      schemaVersion: 1 as const,
      generatedAt: '2026-08-09T09:59:30.000Z',
      providers: [buildUnsupportedCapacity('gemini', {
        configured: true, installed: true, checkedAt: '2026-08-09T09:59:30.000Z'
      })]
    };
    const probe = vi.fn();
    const dependencies = {
      now,
      detectConfigured: async () => ['gemini'],
      isInstalled: async () => true,
      probe,
      readCache: async () => cached,
      writeCache: async () => undefined
    };

    await expect(getCapacityReport({ maxAge: 60 }, dependencies)).resolves.toEqual(cached);
    expect(probe).not.toHaveBeenCalled();

    dependencies.readCache = async () => cached;
    dependencies.probe = vi.fn(async (provider, context) => [buildUnsupportedCapacity(provider, context)]);
    await getCapacityReport({ maxAge: 60, refresh: true }, dependencies);
    expect(dependencies.probe).toHaveBeenCalledOnce();
  });

  it('rejects unknown provider names', async () => {
    await expect(getCapacityReport({ provider: 'made-up' }, {
      now,
      detectConfigured: async () => [],
      isInstalled: async () => false,
      probe: async () => [],
      readCache: async () => null,
      writeCache: async () => undefined
    })).rejects.toThrow('Unknown capacity provider');
  });
});
