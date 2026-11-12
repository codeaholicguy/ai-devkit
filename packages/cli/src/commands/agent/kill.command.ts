import { Command } from "commander";
import {
  AgentRegistry,
  parseTmuxRuntimeRef,
  stopAgent,
  type AgentRuntimeProvider,
  type AgentType,
} from "@ai-devkit/agent-manager";
import {
  DaemonRpcError,
  ensureDaemon,
  type AgentLookupResult,
  type DaemonClient,
} from "@ai-devkit/daemon-client";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { createLogger, enableDebug } from "../../util/debug.js";
import {
  reportAgentResolution,
  resolveAgentByName,
} from "../../services/agent/resolve-agent.service.js";
import { createAgentManager } from "./factory.js";
import { formatStatus } from "./render.js";

const debug = createLogger("agent:kill");

type StopResult = Awaited<ReturnType<typeof stopAgent>>;

function renderStopped(result: StopResult): void {
  if (result.runtime === "herdr") {
    ui.success(`Stopped agent "${result.agentName}" (PID ${result.pid}) and Herdr pane.`);
    return;
  }
  const tmuxRef = parseTmuxRuntimeRef(result.runtimeRef);
  const suffix = tmuxRef ? ` and tmux session "${tmuxRef.session}"` : "";
  ui.success(`Stopped agent "${result.agentName}" (PID ${result.pid})${suffix}.`);
}

/**
 * Daemon kill for one exact name: agent.lookup → agent.unregister (frees the
 * name, no tombstone) → client-side teardown from the returned runtimeRef,
 * reusing stopAgent's tmux/herdr runtimes. `not_found` and `unknown method`
 * hand back to the local path; other coded errors are reported, not retried.
 */
async function daemonKill(
  daemon: DaemonClient,
  name: string,
): Promise<"done" | "fallback" | "failed"> {
  let entry: AgentLookupResult;
  try {
    entry = await daemon.lookupAgent(name);
  } catch (err) {
    if (err instanceof DaemonRpcError && err.code === "not_found") {
      debug(`daemon has no registration named "${name}" -> local resolution`);
      return "fallback";
    }
    if (err instanceof Error && err.message.startsWith("unknown method")) {
      debug("daemon predates agent.lookup (unknown method) -> local fallback");
      return "fallback";
    }
    reportDaemonError(err);
    return "failed";
  }
  debug(
    `daemon lookup: ${entry.name} pid=${entry.pid} runtime=${entry.runtime} alive=${entry.alive}`,
  );
  try {
    await daemon.unregisterAgent(entry.name);
  } catch (err) {
    reportDaemonError(err);
    return "failed";
  }
  debug(`unregistered "${entry.name}"; tearing down ${entry.runtime} client-side`);
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
  const result = await stopAgent(
    { name: entry.name, pid: entry.pid },
    {
      registry: { lookup: () => registryEntry },
      // A dead registration's pid may have been recycled — never signal it;
      // only the runtime session/pane is torn down.
      killProcess: entry.alive ? undefined : () => {},
    },
  );
  renderStopped(result);
  return "done";
}

function reportDaemonError(err: unknown): void {
  if (err instanceof DaemonRpcError && err.code) {
    debug(`daemon returned coded error ${err.code}; not retrying locally`);
  } else {
    debug("transport failure mid-request; reporting without retry");
  }
  ui.error(err instanceof Error ? err.message : String(err));
}

export function registerAgentKillCommand(agentCommand: Command): void {
  agentCommand
    .command("kill <name>")
    .description("Stop a running agent and clean up its managed runtime")
    .option("--debug", "Enable debug logging")
    .action(
      withErrorHandler("kill agent", async (name: string, options: { debug?: boolean }) => {
        if (options?.debug) {
          enableDebug();
        }
        const daemon = await ensureDaemon({ onDebug: debug });
        if (!daemon) debug("no daemon available -> local stopAgent path");
        try {
          if (daemon) {
            const routed = await daemonKill(daemon, name);
            if (routed === "done") return;
            if (routed === "failed") {
              process.exit(1);
              return; // process.exit is mocked under test — don't fall through
            }
          }

          const manager = createAgentManager();
          const resolution = await resolveAgentByName(manager, name);
          if (resolution.kind !== "resolved") {
            reportAgentResolution(
              resolution,
              name,
              ui,
              (agent) => `${agent.name} (${formatStatus(agent.status)})`,
            );
            return;
          }

          const resolved = resolution.agent;
          // Partial match resolved locally — kill the full name through the
          // daemon when it holds the registration.
          if (daemon && resolved.name !== name) {
            const routed = await daemonKill(daemon, resolved.name);
            if (routed === "done") return;
            if (routed === "failed") {
              process.exit(1);
              return;
            }
          }

          debug(`local stopAgent path for "${resolved.name}"`);
          const result = await stopAgent(resolved, {
            registry: AgentRegistry.default(),
          });
          renderStopped({ ...result, agentName: resolved.name, pid: resolved.pid });
        } finally {
          daemon?.close();
        }
      }),
    );
}
