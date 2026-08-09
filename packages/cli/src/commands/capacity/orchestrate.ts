import { ENVIRONMENT_DEFINITIONS } from '../../util/env.js';
import { readCapacityCache, writeCapacityCache } from './cache.js';
import { detectConfiguredProviders, isBinaryInstalled } from './detection.js';
import { probeClaudeCapacity } from './providers/claude.js';
import { probeCodexCapacity } from './providers/codex.js';
import { probePiCapacity } from './providers/pi.js';
import { buildUnsupportedCapacity } from './providers/stub.js';
import type { CapacityReport, ProviderCapacity } from './types.js';

type ProbeContext = { configured: boolean; installed: boolean; checkedAt: string };
type CapacityOptions = { provider?: string; maxAge?: number; refresh?: boolean };
type Dependencies = {
  now: () => Date;
  detectConfigured: () => Promise<string[]>;
  isInstalled: (provider: string) => Promise<boolean>;
  probe: (provider: string, context: ProbeContext) => Promise<ProviderCapacity[]>;
  readCache: (key: string, maxAge: number, now: Date) => Promise<CapacityReport | null>;
  writeCache: (key: string, report: CapacityReport) => Promise<void>;
};

const providerNames = Object.keys(ENVIRONMENT_DEFINITIONS).map(name => name === 'github' ? 'copilot' : name);
export const CAPACITY_PROVIDERS = [...new Set([...providerNames, 'glm'])].sort();

const BINARIES: Record<string, string> = {
  'antigravity-cli': 'agy', copilot: 'copilot', gemini: 'gemini', github: 'copilot', glm: 'pi'
};

async function defaultProbe(provider: string, context: ProbeContext): Promise<ProviderCapacity[]> {
  if (provider === 'codex') return [await probeCodexCapacity(context)];
  if (provider === 'claude') return [await probeClaudeCapacity(context)];
  if (provider === 'pi' || provider === 'glm') {
    const results = await probePiCapacity(context);
    if (provider === 'pi') return results;
    return [results.find(result => result.provider === 'glm') ??
      buildUnsupportedCapacity('glm', context, null,
        'GLM capacity is unknown because no verified quota mechanism is available.')];
  }
  return [buildUnsupportedCapacity(provider, context)];
}

const defaults: Dependencies = {
  now: () => new Date(),
  detectConfigured: detectConfiguredProviders,
  isInstalled: provider => isBinaryInstalled(BINARIES[provider] ?? provider),
  probe: defaultProbe,
  readCache: readCapacityCache,
  writeCache: writeCapacityCache
};

function failure(provider: string, context: ProbeContext, code = 'probe-failed'): ProviderCapacity {
  const result = buildUnsupportedCapacity(provider, context, null, 'Capacity could not be checked safely.');
  result.status = 'unknown';
  result.error = { code, retryable: true };
  return result;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getCapacityReport(
  options: CapacityOptions = {},
  dependencies: Dependencies = defaults
): Promise<CapacityReport> {
  const requested = options.provider?.toLowerCase();
  if (requested && !CAPACITY_PROVIDERS.includes(requested)) {
    throw new Error(`Unknown capacity provider "${options.provider}".`);
  }
  const now = dependencies.now();
  const configured = await dependencies.detectConfigured();
  const selected = requested ? [requested] : configured;
  const cacheKey = `${requested ? 'provider' : 'configured'}:${selected.slice().sort().join(',')}`;
  const maxAge = options.maxAge ?? 300;
  if (!options.refresh && maxAge > 0) {
    const cached = await dependencies.readCache(cacheKey, maxAge, now);
    if (cached) return cached;
  }

  const groups = await Promise.all(selected.map(async provider => {
    const binaryProvider = provider === 'glm' ? 'pi' : provider;
    const context: ProbeContext = {
      configured: configured.includes(provider) || (provider === 'glm' && configured.includes('pi')),
      installed: await dependencies.isInstalled(binaryProvider),
      checkedAt: now.toISOString()
    };
    try {
      const results = await withTimeout(dependencies.probe(provider, context), 7000);
      return requested === 'pi' ? results.filter(result => result.provider === 'pi') : results;
    } catch {
      return [failure(provider, context)];
    }
  }));
  const providers = groups.flat().sort((left, right) => left.provider.localeCompare(right.provider));
  const report: CapacityReport = { schemaVersion: 1, generatedAt: now.toISOString(), providers };
  try {
    await dependencies.writeCache(cacheKey, report);
  } catch {
    // Cache failures must not prevent a capacity report.
  }
  return report;
}
