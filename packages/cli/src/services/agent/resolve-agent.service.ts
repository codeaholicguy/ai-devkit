import {
  DurableAgentRepository,
  type AgentInfo,
  type AgentManager,
} from "@ai-devkit/agent-manager";

type AgentResolver = Pick<AgentManager, "listAgents" | "resolveAgent">;

export type AgentResolution =
  | { kind: "empty"; agents: AgentInfo[] }
  | { kind: "not-found"; agents: AgentInfo[] }
  | { kind: "ambiguous"; agents: AgentInfo[]; matches: AgentInfo[] }
  | { kind: "resolved"; agents: AgentInfo[]; agent: AgentInfo };

/**
 * List running agents and resolve `identifier` against them, classifying the
 * outcome so callers can keep their own UX for each case.
 */
export async function resolveAgentByName(
  manager: AgentResolver,
  identifier: string,
  knownAgents?: AgentInfo[],
): Promise<AgentResolution> {
  const agents = knownAgents ?? (await manager.listAgents());
  if (agents.length === 0) return { kind: "empty", agents };

  const resolved = manager.resolveAgent(identifier, agents);
  if (!resolved) return { kind: "not-found", agents };
  if (Array.isArray(resolved)) return { kind: "ambiguous", agents, matches: resolved };
  return { kind: "resolved", agents, agent: resolved };
}

export interface AgentResolutionReporter {
  error(text: string): void;
  info(text: string): void;
  /** Plain candidate line — maps to `ui.text` or `reporter.info` at the call site. */
  text(text: string): void;
}

/**
 * Standard reporting for non-resolved outcomes. Callers with an interactive
 * disambiguation flow (e.g. `agent open`) handle `ambiguous` themselves and
 * only use this for `empty`/`not-found`.
 */
export function reportAgentResolution(
  resolution: AgentResolution,
  identifier: string,
  reporter: AgentResolutionReporter,
  formatMatch: (agent: AgentInfo) => string = (agent) => agent.name,
): void {
  switch (resolution.kind) {
    case "empty":
      reporter.error("No running agents found.");
      return;
    case "not-found":
      reporter.error(`No agent found matching "${identifier}".`);
      reporter.info("Available agents:");
      resolution.agents.forEach((agent) => reporter.text(`  - ${agent.name}`));
      return;
    case "ambiguous":
      reporter.error(`Multiple agents match "${identifier}":`);
      resolution.matches.forEach((agent) => reporter.text(`  - ${formatMatch(agent)}`));
      reporter.info("Please use a more specific name.");
      return;
    case "resolved":
      return;
  }
}

/**
 * Throw when a partial identifier matches a durable agent while a live agent
 * with the same name exists — the durable id wins only on exact match.
 */
export function assertDurableNameUnambiguous(
  identifier: string,
  durableAgentId: string,
  liveAgents: AgentInfo[],
): void {
  if (identifier === durableAgentId) return;
  const liveExact = liveAgents.filter(
    (agent) => agent.name.toLowerCase() === identifier.toLowerCase(),
  );
  if (liveExact.length > 0) {
    throw new Error(
      `Agent name "${identifier}" is ambiguous across interactive and durable modes. Use the durable agent ID.`,
    );
  }
}

export type DurableAgentResolution = Exclude<
  Awaited<ReturnType<DurableAgentRepository["resolve"]>>,
  null | unknown[]
>;

/**
 * Resolve a durable agent by name or id. Throws on multiple matches and on
 * cross-mode ambiguity; `getLiveAgents` is only consulted when the identifier
 * is a non-exact match, so callers that already listed agents can pass a
 * constant and interactive-only callers avoid an extra listAgents call.
 */
export async function resolveDurableAgentEntry(
  identifier: string,
  getLiveAgents: () => Promise<AgentInfo[]>,
  repository = new DurableAgentRepository(),
): Promise<DurableAgentResolution | null> {
  const resolved = await repository.resolve(identifier);
  if (Array.isArray(resolved)) {
    throw new Error(`Multiple durable agents match "${identifier}".`);
  }
  if (!resolved) return null;
  if (resolved.id !== identifier) {
    assertDurableNameUnambiguous(identifier, resolved.id, await getLiveAgents());
  }
  return resolved;
}
