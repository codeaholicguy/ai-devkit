import { Command } from "commander";
import {
  AgentRegistry,
  parseTmuxRuntimeRef,
  stopAgent,
} from "@ai-devkit/agent-manager";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import {
  reportAgentResolution,
  resolveAgentByName,
} from "../../services/agent/resolve-agent.service.js";
import { createAgentManager } from "./factory.js";
import { formatStatus } from "./render.js";

export function registerAgentKillCommand(agentCommand: Command): void {
  agentCommand
    .command("kill <name>")
    .description("Stop a running agent and clean up its managed runtime")
    .action(
      withErrorHandler("kill agent", async (name: string) => {
        const manager = createAgentManager();
        const resolution = await resolveAgentByName(manager, name);
        if (resolution.kind !== "resolved") {
          reportAgentResolution(resolution, name, ui, (agent) =>
            `${agent.name} (${formatStatus(agent.status)})`,
          );
          return;
        }

        const resolved = resolution.agent;
        const registry = AgentRegistry.default();
        const result = await stopAgent(resolved, {
          registry,
        });
        if (result.runtime === "herdr") {
          ui.success(
            `Stopped agent "${resolved.name}" (PID ${resolved.pid}) and Herdr pane.`,
          );
          return;
        }

        const tmuxRef = parseTmuxRuntimeRef(result.runtimeRef);
        const suffix = tmuxRef ? ` and tmux session "${tmuxRef.session}"` : "";
        ui.success(
          `Stopped agent "${result.agentName}" (PID ${result.pid})${suffix}.`,
        );
      }),
    );
}
