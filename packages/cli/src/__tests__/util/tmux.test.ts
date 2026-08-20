import {
  inspectTmux,
  parseOsRelease,
  resolveTmuxInstallInstructions,
} from '../../util/tmux.js';

describe('tmux host prerequisite', () => {
  it('reports an available tmux version while retaining raw output', async () => {
    const run = vi.fn().mockResolvedValue({ stdout: 'tmux 3.4\n' });

    await expect(inspectTmux({
      run,
      platform: 'linux',
      readOsRelease: vi.fn(),
      releaseText: '',
      which: vi.fn(),
    })).resolves.toEqual({ state: 'available', version: '3.4', rawVersion: 'tmux 3.4' });
    expect(run).toHaveBeenCalledWith('tmux', ['-V']);
  });

  it('reports a missing executable without throwing', async () => {
    const error = Object.assign(new Error('spawn tmux ENOENT'), { code: 'ENOENT' });

    await expect(inspectTmux({
      run: vi.fn().mockRejectedValue(error),
      platform: 'linux',
      readOsRelease: vi.fn(),
      releaseText: '',
      which: vi.fn(),
    })).resolves.toEqual({ state: 'missing', version: null, rawVersion: null });
  });

  it('reports execution failures without treating them as missing', async () => {
    await expect(inspectTmux({
      run: vi.fn().mockRejectedValue(new Error('permission denied')),
      platform: 'linux',
      readOsRelease: vi.fn(),
      releaseText: '',
      which: vi.fn(),
    })).resolves.toEqual({ state: 'error', version: null, rawVersion: 'permission denied' });
  });

  it('safely stringifies non-Error execution failures', async () => {
    await expect(inspectTmux({
      run: vi.fn().mockRejectedValue('failed'),
      platform: 'linux', readOsRelease: vi.fn(), releaseText: '', which: vi.fn(),
    })).resolves.toEqual({ state: 'error', version: null, rawVersion: 'failed' });
  });

  it('retains unparsed version output', async () => {
    await expect(inspectTmux({
      run: vi.fn().mockResolvedValue({ stdout: 'unexpected output' }),
      platform: 'linux',
      readOsRelease: vi.fn(),
      releaseText: '',
      which: vi.fn(),
    })).resolves.toEqual({ state: 'available', version: null, rawVersion: 'unexpected output' });
  });

  it('parses quoted os-release values and ignores malformed lines', () => {
    expect(parseOsRelease('ID="ubuntu"\nID_LIKE="debian linux"\nBROKEN\n')).toEqual({
      id: 'ubuntu',
      idLike: ['debian', 'linux'],
    });
  });

  it('parses single-quoted and empty os-release values', () => {
    expect(parseOsRelease("ID='ALPINE'\n")).toEqual({ id: 'alpine', idLike: [] });
    expect(parseOsRelease('')).toEqual({ id: '', idLike: [] });
  });

  it.each([
    ['linux', 'ID=ubuntu', '', 'sudo apt-get update && sudo apt-get install tmux'],
    ['linux', 'ID=debian', '', 'sudo apt-get update && sudo apt-get install tmux'],
    ['linux', 'ID=fedora', '', 'sudo dnf install tmux'],
    ['linux', 'ID=rocky\nID_LIKE="rhel fedora"', '', 'sudo dnf install tmux'],
    ['linux', 'ID=alpine', '', 'sudo apk add tmux'],
    ['linux', 'ID=arch', '', 'sudo pacman -S tmux'],
    ['linux', 'ID=manjaro\nID_LIKE=arch', '', 'sudo pacman -S tmux'],
    ['darwin', '', '', 'brew install tmux'],
  ])('maps %s %s to a copy-paste command', async (platform, osRelease, releaseText, command) => {
    const instructions = await resolveTmuxInstallInstructions({
      platform: platform as NodeJS.Platform,
      readOsRelease: vi.fn().mockResolvedValue(osRelease),
      releaseText,
      which: vi.fn().mockResolvedValue(true),
    });

    expect(instructions.command).toBe(command);
    expect(instructions.message).toContain(command);
  });

  it('labels WSL commands as running inside the Linux distribution', async () => {
    const instructions = await resolveTmuxInstallInstructions({
      platform: 'linux',
      readOsRelease: vi.fn().mockResolvedValue('ID=ubuntu'),
      releaseText: '5.15.0-microsoft-standard-WSL2',
      which: vi.fn(),
    });

    expect(instructions.message).toContain('inside your WSL distribution');
  });

  it('provides explicit guidance for NixOS, native Windows, BSD, and unknown Linux', async () => {
    const cases = [
      ['linux', 'ID=nixos', 'nix shell nixpkgs#tmux'],
      ['win32', '', 'WSL'],
      ['freebsd', '', 'not currently supported'],
      ['linux', 'ID=unknown', 'system package manager'],
    ] as const;

    for (const [platform, osRelease, expected] of cases) {
      const instructions = await resolveTmuxInstallInstructions({
        platform,
        readOsRelease: vi.fn().mockResolvedValue(osRelease),
        releaseText: '',
        which: vi.fn().mockResolvedValue(false),
      });
      expect(instructions.message).toContain(expected);
    }
  });

  it('covers unsupported Unix, OpenBSD, missing Homebrew, and WSL fallback guidance', async () => {
    const unsupported = await resolveTmuxInstallInstructions({
      platform: 'aix', readOsRelease: vi.fn(), releaseText: '', which: vi.fn(),
    });
    expect(unsupported.message).toContain('system package manager');

    const openbsd = await resolveTmuxInstallInstructions({
      platform: 'openbsd', readOsRelease: vi.fn(), releaseText: '', which: vi.fn(),
    });
    expect(openbsd.message).toContain('not currently supported');

    const macos = await resolveTmuxInstallInstructions({
      platform: 'darwin', readOsRelease: vi.fn(), releaseText: '', which: vi.fn().mockRejectedValue(new Error('no PATH')),
    });
    expect(macos.message).toContain('Install Homebrew first');

    const wsl = await resolveTmuxInstallInstructions({
      platform: 'linux', readOsRelease: vi.fn().mockResolvedValue('ID=unknown'), releaseText: 'WSL2', which: vi.fn(),
    });
    expect(wsl.message).toContain('inside your WSL distribution');
  });

  it('falls back gracefully when os-release cannot be read', async () => {
    const instructions = await resolveTmuxInstallInstructions({
      platform: 'linux',
      readOsRelease: vi.fn().mockRejectedValue(new Error('missing')),
      releaseText: '',
      which: vi.fn(),
    });

    expect(instructions.command).toBeNull();
    expect(instructions.message).toContain('system package manager');
  });
});
