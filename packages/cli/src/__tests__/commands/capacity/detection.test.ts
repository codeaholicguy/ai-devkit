import { describe, expect, it, vi } from 'vitest';
import { detectConfiguredProviders, isBinaryInstalled } from '../../../commands/capacity/detection.js';

describe('capacity provider detection', () => {
  it('derives configured providers from ENVIRONMENT_DEFINITIONS config directories', async () => {
    const exists = vi.fn(async (path: string) =>
      path === '/users/test/.codex' || path === '/users/test/.config/opencode'
    );

    await expect(detectConfiguredProviders({ homeDir: '/users/test', exists })).resolves.toEqual([
      'codex',
      'opencode'
    ]);
    expect(exists).toHaveBeenCalledWith('/users/test/.codex');
    expect(exists).toHaveBeenCalledWith('/users/test/.config/opencode');
  });

  it('checks PATH without running a provider command', async () => {
    const access = vi.fn(async (path: string) => {
      if (path !== '/opt/bin/codex') throw new Error('missing');
    });

    await expect(isBinaryInstalled('codex', { path: '/usr/bin:/opt/bin', access })).resolves.toBe(true);
    await expect(isBinaryInstalled('claude', { path: '/usr/bin:/opt/bin', access })).resolves.toBe(false);
  });
});
