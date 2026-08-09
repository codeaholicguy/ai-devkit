import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { CapacityReport } from './types.js';

function defaultCachePath(): string {
  return path.join(homedir(), '.ai-devkit', 'cache', 'capacity.json');
}

function isReport(value: unknown): value is CapacityReport {
  if (value === null || typeof value !== 'object') return false;
  const report = value as Partial<CapacityReport>;
  return report.schemaVersion === 1 && typeof report.generatedAt === 'string' && Array.isArray(report.providers);
}

export async function readCapacityCache(
  key: string,
  maxAgeSeconds: number,
  now = new Date(),
  cachePath = defaultCachePath()
): Promise<CapacityReport | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(cachePath, 'utf8'));
    if (parsed === null || typeof parsed !== 'object') return null;
    const entry = parsed as { key?: unknown; report?: unknown };
    if (entry.key !== key || !isReport(entry.report)) return null;
    const age = now.getTime() - Date.parse(entry.report.generatedAt);
    return age >= 0 && age <= maxAgeSeconds * 1000 ? entry.report : null;
  } catch {
    return null;
  }
}

export async function writeCapacityCache(
  key: string,
  report: CapacityReport,
  cachePath = defaultCachePath()
): Promise<void> {
  const directory = path.dirname(cachePath);
  const temporary = `${cachePath}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  await writeFile(temporary, JSON.stringify({ key, report }), { encoding: 'utf8', mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, cachePath);
}
