import {
  AgentManager,
  AgentRegistry,
  createBuiltinAdapters,
  ClaudePrintAgentService,
  CodexPrintAgentService,
  DurableAgentRepository,
  PiPrintAgentService,
  type DurableProvider,
} from "@ai-devkit/agent-manager";
import { ensureDaemon } from "@ai-devkit/daemon-client";
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

export function createDurableAgentService(
  provider: DurableProvider = "claude",
): ClaudePrintAgentService | CodexPrintAgentService | PiPrintAgentService {
  const repository = new DurableAgentRepository();
  if (provider === "codex") return new CodexPrintAgentService({ repository });
  if (provider === "pi") return new PiPrintAgentService({ repository });
  return new ClaudePrintAgentService({ repository });
}
