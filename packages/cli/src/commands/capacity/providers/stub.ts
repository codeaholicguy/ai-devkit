import type { ProviderCapacity } from '../types.js';

type StubContext = { configured: boolean; installed: boolean; checkedAt: string };

const AGENT_TYPES: Record<string, string> = {
  claude: 'claude', codex: 'codex', copilot: 'copilot', gemini: 'gemini_cli',
  glm: 'pi', grok: 'grok_cli', opencode: 'opencode', pi: 'pi'
};

export function buildUnsupportedCapacity(
  provider: string,
  context: StubContext,
  authenticated: boolean | null = null,
  warning = 'Authoritative capacity discovery is not supported for this provider.'
): ProviderCapacity {
  return {
    provider,
    agentType: AGENT_TYPES[provider] ?? null,
    configured: context.configured,
    installed: context.installed,
    authenticated,
    status: 'unsupported',
    available: 'unknown',
    plan: null,
    checkedAt: context.checkedAt,
    source: 'none',
    windows: [],
    aliases: { dailyWindowId: null, weeklyWindowId: null },
    warnings: [{ code: 'capacity-unsupported', message: warning }]
  };
}
