import { constants } from 'node:fs';
import { access as fsAccess } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { probeCodexCapacity } from './codex.js';
import type { CapacityReport, ProviderCapacity } from './types.js';

export type { CapacityReport, CapacityWindow, ProviderCapacity, UsageSnapshot } from './types.js';

export type CapacityProbeOptions = {
  now?: () => Date;
  homeDir?: string;
  path?: string;
  exists?: (target: string) => Promise<boolean>;
  access?: (target: string) => Promise<void>;
  probe?: typeof probeCodexCapacity;
};

async function canAccess(target: string, mode: number): Promise<boolean> {
  try {
    await fsAccess(target, mode);
    return true;
  } catch {
    return false;
  }
}

async function isCodexInstalled(pathValue: string, checkAccess?: (target: string) => Promise<void>): Promise<boolean> {
  const directories = pathValue.split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    const executable = path.join(directory, 'codex');
    if (checkAccess) {
      try {
        await checkAccess(executable);
        return true;
      } catch {
        continue;
      }
    }
    if (await canAccess(executable, constants.X_OK)) return true;
  }
  return false;
}

function failedCapacity(configured: boolean, installed: boolean, checkedAt: string): ProviderCapacity {
  return {
    provider: 'codex',
    agentType: 'codex',
    configured,
    installed,
    authenticated: null,
    status: installed ? 'unknown' : 'unavailable',
    available: 'unknown',
    plan: null,
    checkedAt,
    source: 'none',
    windows: [],
    aliases: { dailyWindowId: null, weeklyWindowId: null },
    resetCredits: { available: null },
    warnings: [{
      code: installed ? 'probe-failed' : 'cli-not-installed',
      message: installed ? 'Codex capacity could not be read safely.' : 'Codex CLI is not installed.'
    }],
    ...(installed ? { error: { code: 'codex-probe-failed', retryable: true } } : {})
  };
}

export async function getCodexCapacityReport(options: CapacityProbeOptions = {}): Promise<CapacityReport> {
  const now = options.now?.() ?? new Date();
  const checkedAt = now.toISOString();
  const home = options.homeDir ?? homedir();
  const exists = options.exists ?? (target => canAccess(target, constants.F_OK));
  const configured = await exists(path.join(home, '.codex'));
  const installed = await isCodexInstalled(options.path ?? process.env.PATH ?? '', options.access);

  let capacity: ProviderCapacity;
  try {
    capacity = await (options.probe ?? probeCodexCapacity)({ configured, installed, checkedAt });
  } catch {
    capacity = failedCapacity(configured, installed, checkedAt);
  }

  return { schemaVersion: 1, generatedAt: checkedAt, providers: [capacity] };
}
