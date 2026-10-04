import { claudeReadiness } from "../claude/readiness.js";
import { codexReadiness } from "../codex/readiness.js";
import { copilotReadiness } from "../copilot/readiness.js";
import { openCodeReadiness } from "../opencode/readiness.js";
import { piReadiness } from "../pi/readiness.js";
import { devinReadiness } from "../devin/readiness.js";
import {
  builtInSkillsCheck,
  createReadinessRuntime,
  directoryCheck,
  executableCheck,
  worstReadinessStatus,
} from "./checks.js";
import {
  READINESS_AGENT_TYPES,
  type AgentReadinessOptions,
  type AgentReadinessReport,
  type HarnessReadinessProfile,
  type ReadinessAgentType,
  type ReadinessRuntime,
} from "./types.js";

const READINESS_PROFILES: Record<ReadinessAgentType, HarnessReadinessProfile> = {
  claude: claudeReadiness,
  codex: codexReadiness,
  gemini_cli: { configDir: ".gemini" },
  grok_cli: { configDir: ".grok" },
  kiro: { configDir: ".kiro" },
  antigravity_cli: { configDir: ".gemini/antigravity-cli" },
  opencode: openCodeReadiness,
  copilot: copilotReadiness,
  pi: piReadiness,
  devin: devinReadiness,
};

export async function getAgentReadinessReport(
  agent: ReadinessAgentType,
  options: AgentReadinessOptions = {},
): Promise<AgentReadinessReport> {
  return agentReadiness(agent, createReadinessRuntime(options));
}

async function agentReadiness(
  agent: ReadinessAgentType,
  runtime: ReadinessRuntime,
): Promise<AgentReadinessReport> {
  const profile = READINESS_PROFILES[agent];
  const [executable, globalConfig, builtInSkills, auth, integration] = await Promise.all([
    executableCheck(agent, runtime),
    directoryCheck(profile.configDir, runtime),
    builtInSkillsCheck(agent, runtime),
    profile.auth?.(runtime),
    profile.integration?.(runtime),
  ]);
  return {
    type: agent,
    executable,
    globalConfig,
    builtInSkills,
    auth,
    integration,
    status: worstReadinessStatus([
      executable.status,
      globalConfig.status,
      ...(auth ? [auth.status] : []),
      ...(integration ? [integration.status] : []),
    ]),
  };
}

export async function getAgentReadinessReports(
  options: AgentReadinessOptions = {},
): Promise<Record<ReadinessAgentType, AgentReadinessReport>> {
  const runtime = createReadinessRuntime(options);
  const entries = await Promise.all(
    READINESS_AGENT_TYPES.map(
      async (agent) => [agent, await agentReadiness(agent, runtime)] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<ReadinessAgentType, AgentReadinessReport>;
}

export { worstReadinessStatus } from "./checks.js";
export type {
  AgentReadinessOptions,
  AgentReadinessReport,
  ReadinessAgentType,
  ReadinessStatus,
} from "./types.js";
