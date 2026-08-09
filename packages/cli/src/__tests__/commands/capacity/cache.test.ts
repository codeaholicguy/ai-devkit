import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCapacityCache, writeCapacityCache } from '../../../commands/capacity/cache.js';

describe('capacity cache', () => {
  it('stores only normalized reports with restrictive permissions', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'capacity-cache-'));
    const cachePath = path.join(directory, 'nested', 'capacity.json');
    const report = { schemaVersion: 1 as const, generatedAt: '2026-08-09T10:00:00.000Z', providers: [] };

    await writeCapacityCache('configured:codex', report, cachePath);

    expect((await stat(cachePath)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(cachePath, 'utf8'))).toEqual({ key: 'configured:codex', report });
    await expect(readCapacityCache(
      'configured:codex', 60, new Date('2026-08-09T10:00:30.000Z'), cachePath
    )).resolves.toEqual(report);
    await expect(readCapacityCache(
      'configured:codex', 60, new Date('2026-08-09T10:02:00.000Z'), cachePath
    )).resolves.toBeNull();
  });
});
