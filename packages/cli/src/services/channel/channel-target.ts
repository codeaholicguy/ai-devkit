import {
  AgentStatus,
  TerminalType,
  type AgentInfo,
  type TerminalLocation,
} from "@ai-devkit/agent-manager";
import {
  DaemonClient,
  DaemonRpcError,
  ensureDaemon,
  type AgentLookupResult,
  type EnrichedAgent,
} from "@ai-devkit/daemon-client";

type ChannelDaemon = Pick<DaemonClient, "request" | "lookupAgent" | "listAgents" | "close">;
type Connect = () => Promise<ChannelDaemon | null>;
export type ChannelSession = Pick<AgentInfo, "sessionId" | "sessionFilePath">;

type Target =
  | { kind: "fallback" }
  | { kind: "missing"; agents: AgentInfo[] }
  | {
      kind: "resolved";
      agent: AgentInfo;
      terminal?: TerminalLocation;
      dead: boolean;
      isAlive: () => Promise<boolean>;
      refreshSession?: () => Promise<ChannelSession | undefined>;
    };

function toAgent(row: EnrichedAgent): AgentInfo {
  return {
    ...row,
    type: row.type as AgentInfo["type"],
    status: row.status as AgentStatus,
    lastActive: new Date(row.lastActive),
  };
}

async function lookup(
  daemon: ChannelDaemon,
  name: string,
  options?: Parameters<DaemonClient["lookupAgent"]>[1],
): Promise<AgentLookupResult | undefined> {
  try {
    return await daemon.lookupAgent(name, options);
  } catch (err) {
    if (err instanceof DaemonRpcError && err.code === "not_found") return undefined;
    throw err;
  }
}

function sessionFor(rows: EnrichedAgent[], pid: number): ChannelSession | undefined {
  const row = rows.find((entry) => entry.pid === pid);
  return row && { sessionId: row.sessionId, sessionFilePath: row.sessionFilePath };
}

export async function resolveDaemonChannelTarget(
  name: string,
  selectAgent: (agents: AgentInfo[]) => Promise<AgentInfo>,
  connect: Connect = ensureDaemon,
  reconnect: Connect = DaemonClient.tryConnect,
): Promise<Target> {
  const daemon = await connect();
  if (!daemon) return { kind: "fallback" };
  try {
    const status = (await daemon.request("daemon.status")) as { agentLookupTerminal?: boolean };
    if (!status.agentLookupTerminal) return { kind: "fallback" };

    let entry = await lookup(daemon, name, { resolveTerminal: true });
    const rows = entry && !entry.alive ? [] : await daemon.listAgents();
    if (!entry) {
      const agents = rows.map(toAgent);
      const input = name.toLowerCase();
      const exact = agents.find((agent) => agent.name.toLowerCase() === input);
      const matches = exact
        ? [exact]
        : agents.filter((agent) => agent.name.toLowerCase().includes(input));
      if (!matches.length) return { kind: "missing", agents };
      const selected = matches.length === 1 ? matches[0] : await selectAgent(matches);
      entry = await lookup(daemon, selected.name, {
        resolveTerminal: true,
        listedPid: selected.pid,
      });
      if (!entry || entry.pid !== selected.pid) return { kind: "missing", agents };
    }

    const { pid, name: agentName } = entry;
    const dead = !entry.alive;
    const allowListed = !entry.runtime;
    const agent: AgentInfo = {
      name: entry.name,
      pid: entry.pid,
      type: entry.type as AgentInfo["type"],
      projectPath: entry.cwd,
      lastActive: new Date(),
      status: AgentStatus.RUNNING,
      summary: "",
      sessionId: "",
      ...sessionFor(rows, pid),
    };
    const terminal = entry.terminalTarget;
    return {
      kind: "resolved",
      agent,
      dead,
      terminal: terminal && { ...terminal, type: TerminalType.TMUX },
      isAlive: async () => {
        if (dead) return false;
        const client = await reconnect();
        if (!client) throw new Error("Could not verify agent liveness");
        try {
          const current = await lookup(
            client,
            agentName,
            allowListed ? { listedPid: pid } : undefined,
          );
          return current?.pid === pid && current.alive;
        } finally {
          client.close();
        }
      },
      refreshSession:
        dead || (agent.sessionId && agent.sessionFilePath)
          ? undefined
          : async () => {
              const client = await reconnect();
              if (!client) return undefined;
              try {
                return sessionFor(await client.listAgents(), pid);
              } finally {
                client.close();
              }
            },
    };
  } finally {
    daemon.close();
  }
}

export async function channelAgentLiveness(
  name: string,
  pid: number,
  connect: Connect = DaemonClient.tryConnect,
): Promise<"live" | "gone" | "unresolved"> {
  const daemon = await connect();
  if (!daemon) return "unresolved";
  try {
    const entry = await lookup(daemon, name, { listedPid: pid });
    if (!entry) return "unresolved";
    return entry.alive && entry.pid === pid ? "live" : "gone";
  } catch (err) {
    if (err instanceof DaemonRpcError && !err.code && err.message.startsWith("unknown method")) {
      return "unresolved";
    }
    throw err;
  } finally {
    daemon.close();
  }
}
