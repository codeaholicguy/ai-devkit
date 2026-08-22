import { constants } from 'node:fs';
import { access as fsAccess } from 'node:fs/promises';
import path from 'node:path';
import { probeCodexCapacity } from './codex.js';
import type { CapacityReport } from './types.js';

export type { CapacityReport, CapacityWindow } from './types.js';

export type CapacityProbeOptions = {
  now?: () => Date;
  path?: string;
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

export async function getCodexCapacityReport(options: CapacityProbeOptions = {}): Promise<CapacityReport> {
  const generatedAt = (options.now?.() ?? new Date()).toISOString();
  const installed = await isCodexInstalled(options.path ?? process.env.PATH ?? '', options.access);
  try {
    return await (options.probe ?? probeCodexCapacity)({ installed, checkedAt: generatedAt });
  } catch {
    return {
      provider: 'codex',
      generatedAt,
      authenticated: null,
      available: 'unknown',
      windows: [],
      creditsRemaining: null
    };
  }
}
