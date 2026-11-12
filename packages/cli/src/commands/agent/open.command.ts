import { Command } from "commander";
import { select } from "@inquirer/prompts";
import {
  AgentRegistry,
  focusAgent,
  TerminalFocusManager,
  type AgentInfo,
} from "@ai-devkit/agent-manager";
import {
  DaemonRpcError,
  ensureDaemon,
  type AgentLookupResult,
  type DaemonClient,
} from "@ai-devkit/daemon-client";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { enableDebug, createLogger } from "../../util/debug.js";
import {
  resolveAgentByName,
  reportAgentResolution,
} from "../../services/agent/resolve-agent.service.js";
import { createAgentManager, createDaemonEntryRegistry } from "./factory.js";
import { formatStatus } from "./render.js";

const debug = createLogger("agent:open");

type FocusTarget = {
  agent: Pick<AgentInfo, "name" | "pid">;
  registry: Pick<AgentRegistry, "lookup">;
};

/**
 * Daemon lookup for one exact (already locally resolved) name. A live
 * registration yields the daemon's pid/runtimeRef so focusAgent drives the
 * client-side GUI/herdr focus from it. `not_found`, `unknown method` and dead
 * registrations hand back to the legacy registry; other errors are reported.
 */
async function daemonFocusTarget(
  daemon: DaemonClient,
  agent: AgentInfo,
): Promise<FocusTarget | "fallback" | "failed"> {
  let entry: AgentLookupResult;
  try {
    entry = await daemon.lookupAgent(agent.name);
  } catch (err) {
    if (err instanceof DaemonRpcError && err.code === "not_found") {
      debug(`daemon has no registration named "${agent.name}" -> legacy registry`);
      return "fallback";
    }
    if (err instanceof Error && err.message.startsWith("unknown method")) {
      debug("daemon predates agent.lookup (unknown method) -> legacy registry");
      return "fallback";
    }
    if (err instanceof DaemonRpcError && err.code) {
      debug(`daemon returned coded error ${err.code}; not retrying locally`);
    } else {
      debug("transport failure mid-request; reporting without retry");
    }
    ui.error(err instanceof Error ? err.message : String(err));
    return "failed";
  }
  debug(
    `daemon lookup: ${entry.name} pid=${entry.pid} runtime=${entry.runtime} alive=${entry.alive}`,
  );
  if (!entry.alive) {
    // A tombstone's pid may have been recycled — focus by the live listing.
    debug(`registration "${entry.name}" is dead -> legacy registry with listed pid`);
    return "fallback";
  }
  return {
    agent: { name: entry.name, pid: entry.pid },
    registry: createDaemonEntryRegistry(entry),
  };
}

export function registerAgentOpenCommand(agentCommand: Command): void {
  agentCommand
    .command("open <name>")
    .description("Focus a running agent terminal")
    .option("--debug", "Trace how the agent terminal is resolved and focused")
    .action(
      withErrorHandler("open agent", async (name, options) => {
        const terminalLogger = options.debug ? createLogger("terminal") : undefined;
        if (options.debug) {
          enableDebug();
        }
        const manager = createAgentManager();
        // When --debug is set, route the focus manager's decision trace to
        // the ai-devkit:terminal debug logger (enabled above) so users can
        // see which terminal matched and how focus was attempted.
        const focusManager = new TerminalFocusManager(
          terminalLogger ? (message: string) => terminalLogger(message) : undefined,
        );

        const resolution = await resolveAgentByName(manager, name);
        if (resolution.kind === "empty" || resolution.kind === "not-found") {
          reportAgentResolution(resolution, name, ui);
          return;
        }

        let agent;
        if (resolution.kind === "ambiguous") {
          ui.warning(`Multiple agents match "${name}":`);

          agent = await select({
            message: "Select an agent to open:",
            choices: resolution.matches.map((a) => ({
              name: `${a.name} (${formatStatus(a.status)}) - ${a.summary}`,
              value: a,
            })),
          });
        } else {
          agent = resolution.agent;
        }

        // Partial names resolve via the list above; the daemon only takes
        // the exact full name.
        let target: FocusTarget = { agent, registry: AgentRegistry.default() };
        const daemon = await ensureDaemon({ onDebug: debug });
        if (!daemon) debug("no daemon available -> legacy registry");
        if (daemon) {
          try {
            const routed = await daemonFocusTarget(daemon, agent);
            if (routed === "failed") {
              process.exit(1);
              return; // process.exit is mocked under test — don't fall through
            }
            if (routed !== "fallback") target = routed;
          } finally {
            daemon.close();
          }
        }

        if (!target.agent.pid) {
          ui.error(`Cannot focus agent "${target.agent.name}" (No PID found).`);
          return;
        }

        const spinner = ui.spinner(`Switching focus to ${target.agent.name}...`);
        spinner.start();

        const focusResult = await focusAgent(target.agent, {
          registry: target.registry,
          focusManager,
        });
        if (!focusResult.focused && focusResult.reason === "terminal-not-found") {
          spinner.fail(
            `Could not find terminal window for agent "${target.agent.name}" (PID: ${target.agent.pid}).`,
          );
          return;
        }
        if (!focusResult.focused) {
          spinner.fail(`Failed to switch focus to "${target.agent.name}".`);
          return;
        }

        spinner.succeed(`Focused ${target.agent.name}!`);
      }),
    );
}
