import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ProviderCapacity } from '../types.js';
import { buildUnsupportedCapacity } from './stub.js';

type PiOptions = {
  configured: boolean;
  installed: boolean;
  checkedAt: string;
  readAuth?: () => Promise<string>;
  homeDir?: string;
};

export async function probePiCapacity(options: PiOptions): Promise<ProviderCapacity[]> {
  let providers: string[] = [];
  try {
    const raw = await (options.readAuth ?? (() =>
      readFile(path.join(options.homeDir ?? homedir(), '.pi', 'agent', 'auth.json'), 'utf8')))();
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      providers = Object.keys(parsed);
    }
  } catch {
    // Authentication remains unknown; never surface file contents or parser errors.
  }
  const piAuthenticated = providers.length > 0;
  const results = [buildUnsupportedCapacity('pi', options, piAuthenticated || null,
    'Pi is an agent harness and does not expose account-wide capacity.')];
  if (providers.some(provider => provider === 'zai' || provider === 'zai-coding-cn')) {
    results.push(buildUnsupportedCapacity('glm', options, true,
      'GLM authentication is configured through Pi, but no verified quota mechanism is available.'));
  }
  return results;
}
