import { Command } from "commander";
import type { AgentInfo, AgentManager } from "@ai-devkit/agent-manager";
import { ensureDaemon } from "@ai-devkit/daemon-client";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { createLogger, enableDebug } from "../../util/debug.js";
import { parseMilliseconds } from "../../util/time.js";
import { getErrorMessage } from "../../util/text.js";
import {
  AGENT_WAIT_DEFAULT_TIMEOUT_MS,
  agentWaitKey,
  parseWaitUntil,
  waitForAgentChanges,
  type AgentWaitResult,
  type AgentWaitSource,
} from "../../services/agent/agent-wait.service.js";
import {
  AgentGroupNotFoundError,
  createDefaultAgentGroupService,
} from "../../services/agent/agent-group.service.js";
import { createAgentManager } from "./factory.js";

const debug = createLogger("agent:wait");

/**
 * Daemon-backed source: live `agent.*` events wake the wait, and each check
 * reads the daemon's cached list through the manager (same view as
 * `agent list`). Without a daemon, checks use local detection.
 */
async function createWaitSource(manager: AgentManager): Promise<AgentWaitSource> {
  const daemon = await ensureDaemon({ onDebug: debug });
  if (!daemon) debug("no daemon available -> local detection on the fixed re-check");

  return {
    list: async () => {
      let enriched = null;
      if (daemon) {
        try {
          enriched = await daemon.listAgents();
        } catch (err) {
          debug(`daemon agent.list failed (${getErrorMessage(err)}) -> local detection`);
        }
      }
      return manager.listAgents({ enriched });
    },
    subscribe: async (onWake) => {
      if (!daemon) return;
      try {
        await daemon.subscribe(
          (event) => {
            if (event.kind.startsWith("agent.")) onWake();
          },
          { liveOnly: true },
        );
      } catch (err) {
        debug(`daemon subscribe failed (${getErrorMessage(err)}) -> fixed re-check only`);
      }
    },
    close: () => daemon?.close(),
  };
}

function resolveWatchedKeys(
  identifiers: string[],
  agents: AgentInfo[],
  manager: Pick<AgentManager, "resolveAgent">,
): Set<string> {
  const keys = new Set<string>();
  for (const identifier of identifiers) {
    const resolved = manager.resolveAgent(identifier, agents);
    if (!resolved) {
      throw new Error(`No agent found matching "${identifier}".`);
    }
    if (Array.isArray(resolved)) {
      throw new Error(
        `"${identifier}" matched multiple agents (${resolved.map((agent) => agent.name).join(", ")}).`,
      );
    }
    keys.add(agentWaitKey(resolved));
  }
  return keys;
}

function parseWaitTimeout(value: string | undefined): number {
  try {
    return parseMilliseconds(value, AGENT_WAIT_DEFAULT_TIMEOUT_MS).milliseconds;
  } catch (error) {
    throw new Error(`Invalid --timeout. ${(error as Error).message} Example: 540000.`);
  }
}

function renderResult(result: AgentWaitResult, timeoutMs: number, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.reason === "timeout") {
    ui.info(`No matching agent changes within ${timeoutMs}ms.`);
    return;
  }
  for (const change of result.changes) {
    ui.text(
      `${change.name} (${change.type}, pid ${change.pid}): ${change.from ?? "new"} → ${change.to}`,
    );
  }
}

export function registerAgentWaitCommand(agentCommand: Command): void {
  agentCommand
    .command("wait")
    .description("Block until a running agent changes state (waiting, idle, exited, appeared)")
    .option(
      "--id <identifier>",
      "Agent name or partial match to watch (repeatable)",
      (value: string, previous: string[] = []) => [...previous, value],
    )
    .option("--group <name>", "Agent group to watch")
    .option("--until <conditions>", "Comma-separated: waiting, idle, exited, appeared")
    .option(
      "--timeout <milliseconds>",
      `Maximum time to wait, in milliseconds (default: ${AGENT_WAIT_DEFAULT_TIMEOUT_MS})`,
    )
    .option("-j, --json", "Output the result as JSON")
    .option("--debug", "Enable debug logging")
    .action(
      withErrorHandler("wait for agents", async (options) => {
        if (options.debug) {
          enableDebug();
        }
        if (options.id && options.group) {
          throw new Error("Use either --id or --group, not both.");
        }
        const until = parseWaitUntil(options.until);
        const timeoutMs = parseWaitTimeout(options.timeout);

        let identifiers: string[] | undefined = options.id;
        if (options.group) {
          const group = createDefaultAgentGroupService().get(options.group);
          if (!group) {
            throw new AgentGroupNotFoundError(options.group);
          }
          identifiers = group.members;
        }

        const manager = createAgentManager();
        const source = await createWaitSource(manager);
        let watch: Set<string> | undefined;
        if (identifiers) {
          try {
            watch = resolveWatchedKeys(identifiers, await source.list(), manager);
          } catch (error) {
            source.close();
            throw error;
          }
        }

        const result = await waitForAgentChanges({ source, until, timeoutMs, watch });
        renderResult(result, timeoutMs, Boolean(options.json));
      }),
    );
}
