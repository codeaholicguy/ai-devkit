import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const mockWarning = vi.fn();

vi.mock('../../util/terminal-ui.js', () => ({
  ui: {
    warning: (...args: unknown[]) => mockWarning(...args),
  },
}));

describe('getBuiltinSkillNames', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    mockWarning.mockReset();
  });

  it('returns the live bare-array manifest and fetches it once per process', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ['remote-one', 'remote-two'],
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getBuiltinSkillNames } = await import('../../lib/BuiltinSkills.js');

    await expect(getBuiltinSkillNames()).resolves.toEqual(['remote-one', 'remote-two']);
    await expect(getBuiltinSkillNames()).resolves.toEqual(['remote-one', 'remote-two']);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/codeaholicguy/ai-devkit/main/skills/built-in.json'
    );
    expect(mockWarning).not.toHaveBeenCalled();
  });

  it('falls back to the bundled list when the manifest cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

    const { getBuiltinSkillNames } = await import('../../lib/BuiltinSkills.js');

    const names = await getBuiltinSkillNames();
    expect(names).toHaveLength(23);
    expect(names).toContain('agent-communication');
    expect(names).toContain('tdd');
    expect(mockWarning).toHaveBeenCalledWith(
      'Failed to load built-in skills manifest: network unavailable. Using bundled fallback.'
    );
  });

  it('falls back to the bundled list for an unsuccessful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }));

    const { getBuiltinSkillNames } = await import('../../lib/BuiltinSkills.js');

    await expect(getBuiltinSkillNames()).resolves.toHaveLength(23);
    expect(mockWarning).toHaveBeenCalledWith(
      'Failed to load built-in skills manifest: HTTP 404. Using bundled fallback.'
    );
  });

  it('falls back to the bundled list when response JSON cannot be parsed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    }));

    const { getBuiltinSkillNames } = await import('../../lib/BuiltinSkills.js');

    await expect(getBuiltinSkillNames()).resolves.toHaveLength(23);
    expect(mockWarning).toHaveBeenCalledWith(
      'Failed to load built-in skills manifest: Unexpected token. Using bundled fallback.'
    );
  });

  it.each([
    { label: 'an object', manifest: { skills: ['valid-name'] } },
    { label: 'an empty array', manifest: [] },
    { label: 'a non-string item', manifest: ['valid-name', 1] },
    { label: 'a blank name', manifest: ['valid-name', ' '] },
    { label: 'a duplicate name', manifest: ['valid-name', 'valid-name'] },
    { label: 'an invalid skill name', manifest: ['../escape'] },
  ])('rejects $label as a complete manifest', async ({ manifest }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => manifest,
    }));

    const { getBuiltinSkillNames } = await import('../../lib/BuiltinSkills.js');

    await expect(getBuiltinSkillNames()).resolves.toHaveLength(23);
    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringMatching(/^Failed to load built-in skills manifest: .+ Using bundled fallback\.$/)
    );
  });
});

describe('built-in skills manifest', () => {
  it('starts with the current built-in skill names', async () => {
    const manifestPath = new URL('../../../../../skills/built-in.json', import.meta.url);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

    expect(manifest).toHaveLength(23);
    expect(manifest).toEqual(expect.arrayContaining([
      'agent-communication',
      'agent-management',
      'ai-devkit-setup',
      'remote-from-slack',
      'remote-from-telegram',
      'dev-lifecycle',
      'structured-debug',
      'memory',
      'verify',
      'tdd',
    ]));
  });
});
