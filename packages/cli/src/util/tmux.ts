export type TmuxInspection =
  | { state: 'available'; version: string | null; rawVersion: string }
  | { state: 'missing'; version: null; rawVersion: null }
  | { state: 'error'; version: null; rawVersion: string };

type Run = (command: string, args: readonly string[]) => Promise<{ stdout: string | Buffer }>;
type Which = (command: string) => Promise<boolean>;

export interface TmuxPlatformDeps {
  platform: NodeJS.Platform;
  readOsRelease: () => Promise<string>;
  releaseText: string;
  which: Which;
}

export interface InspectTmuxDeps extends TmuxPlatformDeps {
  run: Run;
}

export interface TmuxInstallInstructions {
  command: string | null;
  message: string;
}

export async function inspectTmux(deps: InspectTmuxDeps): Promise<TmuxInspection> {
  try {
    const { stdout } = await deps.run('tmux', ['-V']);
    const rawVersion = stdout.toString().trim();
    const version = /^tmux\s+([^\s]+)/i.exec(rawVersion)?.[1] ?? null;
    return { state: 'available', version, rawVersion };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return { state: 'missing', version: null, rawVersion: null };
    }
    return {
      state: 'error',
      version: null,
      rawVersion: error instanceof Error ? error.message : String(error),
    };
  }
}

export function parseOsRelease(value: string): { id: string; idLike: string[] } {
  const fields = new Map<string, string>();
  for (const line of value.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (!match) continue;
    fields.set(match[1], match[2].trim().replace(/^(?:"(.*)"|'(.*)')$/, '$1$2'));
  }
  return {
    id: (fields.get('ID') ?? '').toLowerCase(),
    idLike: (fields.get('ID_LIKE') ?? '').toLowerCase().split(/\s+/).filter(Boolean),
  };
}

export async function resolveTmuxInstallInstructions(
  deps: TmuxPlatformDeps,
): Promise<TmuxInstallInstructions> {
  if (deps.platform === 'win32') {
    return {
      command: null,
      message: 'Native Windows managed interactive sessions are unsupported. Use a supported WSL distribution and install tmux inside it.',
    };
  }
  if (deps.platform === 'freebsd' || deps.platform === 'openbsd') {
    return {
      command: null,
      message: 'BSD managed interactive sessions are not currently supported; consult your system tmux documentation.',
    };
  }
  if (deps.platform === 'darwin') {
    const hasBrew = await deps.which('brew').catch(() => false);
    const command = 'brew install tmux';
    return {
      command,
      message: hasBrew
        ? `Install it with: ${command}.`
        : `Install Homebrew first, then run: ${command}.`,
    };
  }
  if (deps.platform !== 'linux') {
    return genericInstructions();
  }

  let release = { id: '', idLike: [] as string[] };
  try {
    release = parseOsRelease(await deps.readOsRelease());
  } catch {
    return genericInstructions();
  }
  const distroKeys = [release.id, ...release.idLike];
  const isWsl = /microsoft|wsl/i.test(deps.releaseText);
  const wslSuffix = isWsl ? ' inside your WSL distribution' : '';

  if (distroKeys.includes('nixos')) {
    return {
      command: 'nix shell nixpkgs#tmux',
      message: 'Nix environments are user-managed; use a declarative configuration or run: nix shell nixpkgs#tmux.',
    };
  }

  const command = resolveLinuxCommand(distroKeys);
  if (!command) return genericInstructions(isWsl);
  return {
    command,
    message: `Install it${wslSuffix} with: ${command}. If you are root, omit sudo; otherwise ask your administrator if needed.`,
  };
}

function resolveLinuxCommand(keys: string[]): string | null {
  if (keys.some(key => ['ubuntu', 'debian'].includes(key))) {
    return 'sudo apt-get update && sudo apt-get install tmux';
  }
  if (keys.some(key => ['fedora', 'rhel', 'centos', 'rocky', 'almalinux'].includes(key))) {
    return 'sudo dnf install tmux';
  }
  if (keys.includes('alpine')) return 'sudo apk add tmux';
  if (keys.some(key => ['arch', 'manjaro'].includes(key))) return 'sudo pacman -S tmux';
  return null;
}

function genericInstructions(isWsl = false): TmuxInstallInstructions {
  return {
    command: null,
    message: `Install tmux${isWsl ? ' inside your WSL distribution' : ''} with your system package manager. If you do not have admin access, ask your administrator.`,
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
