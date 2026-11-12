import { Command } from "commander";
import { AgentRegistry, RenameNotFoundError, RenameConflictError } from "@ai-devkit/agent-manager";
import { DaemonRpcError, ensureDaemon, type DaemonClient } from "@ai-devkit/daemon-client";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { AGENT_NAME_REGEX } from "../../util/agent.js";
import { createLogger, enableDebug } from "../../util/debug.js";

const debug = createLogger("agent:rename");

/**
 * Daemon rename: registry + tmux session / live herdr agent renamed together
 * daemon-side. Only `unknown method` (old devkitd) hands back to the local
 * registry path; every other error is reported — the daemon guarantees the
 * registry is unchanged when the runtime rename fails.
 */
async function daemonRename(
  daemon: DaemonClient,
  currentName: string,
  newName: string,
): Promise<"done" | "fallback" | "failed"> {
  try {
    const result = await daemon.renameAgent(currentName, newName);
    debug(
      `daemon renamed ${result.runtime} agent pid=${result.pid} runtimeRenamed=${result.runtimeRenamed}`,
    );
    for (const warning of result.warnings) ui.warning(warning);
    ui.success(`Agent "${currentName}" renamed to "${newName}".`);
    return "done";
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("unknown method")) {
      debug("daemon predates agent.rename (unknown method) -> local registry fallback");
      return "fallback";
    }
    if (err instanceof DaemonRpcError && err.code) {
      debug(`daemon returned coded error ${err.code}; not retrying locally`);
    } else {
      debug("transport failure mid-request; reporting without retry");
    }
    ui.error(renameErrorMessage(err, currentName, newName));
    return "failed";
  }
}

/** Keep the legacy wording for the cases the TS path already reported. */
function renameErrorMessage(err: unknown, currentName: string, newName: string): string {
  if (err instanceof DaemonRpcError) {
    if (err.code === "not_found") return new RenameNotFoundError(currentName).message;
    // A live agent holds the name; a colliding tmux session keeps the
    // daemon's more specific message.
    const details = err.details as { session?: string } | undefined;
    if (err.code === "name_in_use" && !details?.session) {
      return `Agent "${newName}" is already in use. Choose a different name.`;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export function registerAgentRenameCommand(agentCommand: Command): void {
  agentCommand
    .command("rename <current-name> <new-name>")
    .description("Rename an agent and its tmux session / herdr agent")
    .option("--debug", "Enable debug logging")
    .action(
      withErrorHandler(
        "rename agent",
        async (currentName: string, newName: string, options: { debug?: boolean }) => {
          if (options?.debug) {
            enableDebug();
          }
          if (!AGENT_NAME_REGEX.test(newName)) {
            ui.error(
              `Invalid name "${newName}". Use lowercase letters, digits, and hyphens only. ` +
                "Must start and end with a letter or digit, 2–64 characters.",
            );
            process.exit(1);
            return;
          }

          if (currentName === newName) {
            ui.info(`Agent "${currentName}" already has that name.`);
            return;
          }

          const daemon = await ensureDaemon({ onDebug: debug });
          if (!daemon) debug("no daemon available -> local registry rename");
          try {
            if (daemon) {
              const routed = await daemonRename(daemon, currentName, newName);
              if (routed === "done") return;
              if (routed === "failed") {
                process.exit(1);
                return; // process.exit is mocked under test — don't fall through
              }
            }

            debug(`local registry rename "${currentName}" -> "${newName}"`);
            try {
              AgentRegistry.default().rename(currentName, newName);
              ui.success(`Agent "${currentName}" renamed to "${newName}".`);
            } catch (err) {
              if (err instanceof RenameNotFoundError) {
                ui.error(err.message);
              } else if (err instanceof RenameConflictError) {
                ui.error(`Agent "${err.agentName}" is already in use. Choose a different name.`);
              } else {
                throw err;
              }
              process.exit(1);
            }
          } finally {
            daemon?.close();
          }
        },
      ),
    );
}
