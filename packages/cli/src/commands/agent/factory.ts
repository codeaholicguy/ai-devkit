import {
  AgentManager,
  AgentRegistry,
  createBuiltinAdapters,
  ClaudePrintAgentService,
  CodexPrintAgentService,
  DurableAgentRepository,
  PiPrintAgentService,
  type AgentInfo,
  type AgentRuntimeProvider,
  type AgentType,
  type DurableProvider,
  type EnrichedAgentWire,
} from "@ai-devkit/agent-manager";
import { DaemonRpcError, ensureDaemon, type AgentLookupResult } from "@ai-devkit/daemon-client";
import { ConfigManager } from "../../lib/Config.js";
import { createLogger } from "../../util/debug.js";
import { getErrorMessage } from "../../util/text.js";

export function createAgentManager(): AgentManager {
  const configManager = new ConfigManager();
  const manager = new AgentManager(AgentRegistry.default(), undefined, {
    runtimeProvider: () => configManager.getAgentRuntimeProvider(),
    onRuntimeDiscoveryError: (error) => {
      createLogger("agent")(
        `Herdr pane discovery unavailable for live agent enrichment: ${getErrorMessage(error)}`,
      );
    },
    fetchEnrichedAgents: async () => {
      const client = await ensureDaemon();
      if (!client) return null;
      try {
        return await client.listAgents();
      } finally {
        client.close();
      }
    },
  });
  for (const adapter of createBuiltinAdapters()) manager.registerAdapter(adapter);
  return manager;
}

/**
 * Daemon-first read for `agent list`/`agent detail`: devkitd's `agent.list`
 * is the source when reachable. Falls back (null) on no daemon, `unknown
 * method`, or a socket that dies mid-request — reads are safe to retry
 * locally. Other daemon errors surface.
 */
export async function fetchDaemonAgents(
  debug: (msg: string) => void,
): Promise<EnrichedAgentWire[] | null> {
  const daemon = await ensureDaemon({ onDebug: debug });
  if (!daemon) {
    debug("no daemon available -> falling back to local agent detection");
    return null;
  }
  debug("daemon path: calling agent.list over the daemon socket");
  try {
    const agents = await daemon.listAgents();
    debug(`daemon returned ${agents.length} agent(s)`);
    return agents;
  } catch (err) {
    if (err instanceof DaemonRpcError && err.message.startsWith("unknown method")) {
      debug("daemon predates agent.list (unknown method) -> local fallback");
      return null;
    }
    if (err instanceof DaemonRpcError) throw err;
    debug(`daemon transport failure (${getErrorMessage(err)}) -> local fallback`);
    return null;
  } finally {
    daemon.close();
  }
}

/**
 * Live agents for list/detail. The manager applies the same registry
 * overlay, pin handling, empty-answer cross-check and sort to either source,
 * so output is identical whichever path served it.
 */
export async function listLiveAgents(
  manager: AgentManager,
  debug: (msg: string) => void,
): Promise<AgentInfo[]> {
  const enriched = await fetchDaemonAgents(debug);
  if (!enriched) debug("local path: detecting agents with local adapters");
  return manager.listAgents({ enriched });
}

/**
 * Registry view over one daemon agent.lookup entry, so stopAgent,
 * sendAgentPrompt and focusAgent act client-side on the daemon's runtime +
 * runtimeRef.
 */
export function createDaemonEntryRegistry(entry: AgentLookupResult): Pick<AgentRegistry, "lookup"> {
  const registryEntry = {
    name: entry.name,
    type: entry.type as AgentType,
    pid: entry.pid,
    runtime: entry.runtime as AgentRuntimeProvider,
    runtimeRef: entry.runtimeRef,
    cwd: entry.cwd,
    startedAt: "",
    sessionId: "",
    sessionFilePath: "",
    pinned: entry.pinned,
  };
  return { lookup: () => registryEntry };
}

export function createDurableAgentService(
  provider: DurableProvider = "claude",
): ClaudePrintAgentService | CodexPrintAgentService | PiPrintAgentService {
  const repository = new DurableAgentRepository();
  if (provider === "codex") return new CodexPrintAgentService({ repository });
  if (provider === "pi") return new PiPrintAgentService({ repository });
  return new ClaudePrintAgentService({ repository });
}
