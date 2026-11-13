import type { AgentInfo } from "@ai-devkit/agent-manager";

export const AGENT_WAIT_DEFAULT_TIMEOUT_MS = 540_000;
/** Safety re-check: covers no daemon, a dropped subscription, or a daemon without status events. */
export const AGENT_WAIT_RECHECK_MS = 30_000;
/**
 * Absorb a burst of events before returning. One check already sees every
 * change from a daemon sweep, so this only needs to cover event delivery.
 */
export const AGENT_WAIT_SETTLE_MS = 200;

export const AGENT_WAIT_CONDITIONS = ["waiting", "idle", "exited", "appeared"] as const;
export type AgentWaitCondition = (typeof AGENT_WAIT_CONDITIONS)[number];
const DEFAULT_CONDITIONS: AgentWaitCondition[] = ["waiting", "idle", "exited"];

export interface AgentWaitChange {
  name: string;
  type: string;
  pid: number;
  /** Status before the change; null for an agent that appeared. */
  from: string | null;
  /** New status, or "exited" / "appeared" for lifecycle changes. */
  to: string;
}

export interface AgentWaitResult {
  reason: "triggered" | "timeout";
  elapsedMs: number;
  changes: AgentWaitChange[];
}

/**
 * Where the wait reads agents from. `subscribe` is best-effort: events only
 * make the wait react sooner, the fixed re-check still runs without them.
 */
export interface AgentWaitSource {
  list(): Promise<AgentInfo[]>;
  subscribe(onWake: () => void): Promise<void>;
  close(): void;
}

export interface WaitForAgentChangesParams {
  source: AgentWaitSource;
  until: AgentWaitCondition[];
  timeoutMs: number;
  /** Keys (see agentWaitKey) to watch; omitted means every live agent. */
  watch?: Set<string>;
}

export function agentWaitKey(agent: { type: string; pid: number }): string {
  return `${agent.type}:${agent.pid}`;
}

export function parseWaitUntil(value: string | undefined): AgentWaitCondition[] {
  if (value === undefined) return [...DEFAULT_CONDITIONS];

  const tokens = value
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) {
    throw new Error("--until requires at least one condition.");
  }
  for (const token of tokens) {
    if (!(AGENT_WAIT_CONDITIONS as readonly string[]).includes(token)) {
      throw new Error(
        `Invalid --until value "${token}". Allowed: ${AGENT_WAIT_CONDITIONS.join(", ")}.`,
      );
    }
  }
  return [...new Set(tokens)] as AgentWaitCondition[];
}

/**
 * Changes between the last check and the current agents. Only transitions
 * count: an agent already in a target status does not fire again.
 */
export function diffAgentChanges(
  previous: Map<string, AgentInfo>,
  current: AgentInfo[],
  until: Set<AgentWaitCondition>,
  options: { includeAppeared: boolean },
): AgentWaitChange[] {
  const changes: AgentWaitChange[] = [];
  const currentKeys = new Set<string>();

  for (const agent of current) {
    const key = agentWaitKey(agent);
    currentKeys.add(key);
    const before = previous.get(key);
    if (!before) {
      if (options.includeAppeared && until.has("appeared")) {
        changes.push(toChange(agent, null, "appeared"));
      }
      continue;
    }
    if (before.status !== agent.status && until.has(agent.status as AgentWaitCondition)) {
      changes.push(toChange(agent, before.status, agent.status));
    }
  }

  if (until.has("exited")) {
    for (const [key, agent] of previous) {
      if (!currentKeys.has(key)) changes.push(toChange(agent, agent.status, "exited"));
    }
  }

  return changes;
}

export async function waitForAgentChanges(
  params: WaitForAgentChangesParams,
): Promise<AgentWaitResult> {
  const { source, timeoutMs, watch } = params;
  const until = new Set(params.until);
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const watched = (agents: AgentInfo[]) =>
    watch ? agents.filter((agent) => watch.has(agentWaitKey(agent))) : agents;

  // Wakes that land while a check is running collapse into one follow-up.
  let pendingWake = false;
  let interruptSleep: (() => void) | null = null;
  const wake = () => {
    if (interruptSleep) interruptSleep();
    else pendingWake = true;
  };
  const sleepUntilWake = (ms: number) =>
    new Promise<void>((resolve) => {
      if (pendingWake) {
        pendingWake = false;
        resolve();
        return;
      }
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        interruptSleep = null;
        resolve();
      }
      interruptSleep = done;
    });

  try {
    // Subscribe before the baseline so a change in between still wakes us.
    await source.subscribe(wake);
    let lastSeen = toSeen(watched(await source.list()));
    const changes = new Map<string, AgentWaitChange>();
    let settleDeadline: number | null = null;

    for (;;) {
      const stopAt = settleDeadline ?? deadline;
      const remainingMs = stopAt - Date.now();
      if (remainingMs <= 0) break;
      await sleepUntilWake(Math.min(AGENT_WAIT_RECHECK_MS, remainingMs));

      const current = watched(await source.list());
      const found = diffAgentChanges(lastSeen, current, until, { includeAppeared: !watch });
      lastSeen = toSeen(current);
      for (const change of found) {
        const key = agentWaitKey(change);
        const earlier = changes.get(key);
        changes.set(key, earlier ? { ...change, from: earlier.from } : change);
      }
      if (changes.size > 0 && settleDeadline === null) {
        settleDeadline = Math.min(Date.now() + AGENT_WAIT_SETTLE_MS, deadline);
      }
    }

    return {
      reason: changes.size > 0 ? "triggered" : "timeout",
      elapsedMs: Date.now() - startedAt,
      changes: [...changes.values()],
    };
  } finally {
    interruptSleep = null;
    source.close();
  }
}

function toSeen(agents: AgentInfo[]): Map<string, AgentInfo> {
  return new Map(agents.map((agent) => [agentWaitKey(agent), agent]));
}

function toChange(agent: AgentInfo, from: string | null, to: string): AgentWaitChange {
  return { name: agent.name, type: agent.type, pid: agent.pid, from, to };
}
