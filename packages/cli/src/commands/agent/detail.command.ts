import { Command } from "commander";
import chalk from "chalk";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { agentTypeLabel } from "../../util/agent.js";
import {
  formatLocalTimestamp,
  formatLocalTimestampWithRelative,
} from "../../util/time-format.js";
import {
  reportAgentResolution,
  resolveAgentByName,
  resolveDurableAgentEntry,
} from "../../services/agent/resolve-agent.service.js";
import { createAgentManager } from "./factory.js";
import {
  formatCwd,
  formatSeparator,
  formatStatus,
  renderConversationDetail,
  renderDurableAgentDetail,
  selectConversationMessages,
} from "./render.js";

export function registerAgentDetailCommand(agentCommand: Command): void {
  agentCommand
    .command("detail")
    .description("Show detailed information about a running agent")
    .requiredOption("--id <name>", "Agent name (as shown in agent list)")
    .option("-j, --json", "Output as JSON")
    .option("--full", "Show entire conversation history")
    .option("--tail <n>", "Show last N messages (default: 20)", "20")
    .option("--verbose", "Include tool call/result details")
    .action(
      withErrorHandler("get agent detail", async (options) => {
        const manager = createAgentManager();
        const agents = await manager.listAgents();
        const durableResolved = await resolveDurableAgentEntry(
          options.id,
          async () => agents,
        );
        if (durableResolved) {
          if (options.json) {
            console.log(JSON.stringify(durableResolved, null, 2));
            return;
          }
          renderDurableAgentDetail(durableResolved);
          return;
        }

        const resolution = await resolveAgentByName(manager, options.id, agents);
        if (resolution.kind !== "resolved") {
          reportAgentResolution(resolution, options.id, ui, (agent) =>
            `${agent.name} (${formatStatus(agent.status)})`,
          );
          return;
        }

        const agent = resolution.agent;

        if (!agent.sessionFilePath) {
          ui.error(`No session file found for agent "${agent.name}".`);
          return;
        }

        const adapter = manager.getAdapter(agent.type);
        if (!adapter) {
          ui.error(`Unsupported agent type: ${agent.type}`);
          return;
        }

        const conversation = adapter.getConversation(agent.sessionFilePath, {
          verbose: options.verbose,
        });

        const { displayMessages, isTruncated } = selectConversationMessages(
          conversation,
          options,
        );

        const startTime =
          conversation.length > 0 && conversation[0].timestamp
            ? new Date(conversation[0].timestamp)
            : agent.lastActive;

        if (options.json) {
          const output = {
            sessionId: agent.sessionId,
            cwd: agent.projectPath,
            startTime,
            status: agent.status,
            type: agent.type,
            name: agent.name,
            lastActive: agent.lastActive,
            conversation: displayMessages,
          };
          console.log(JSON.stringify(output, null, 2));
          return;
        }

        ui.text("Agent Detail", { breakline: true });
        ui.text(chalk.dim(formatSeparator()));
        ui.text(`  ${chalk.bold("Session ID:")}  ${agent.sessionId}`);
        ui.text(
          `  ${chalk.bold("CWD:")}         ${formatCwd(agent.projectPath)}`,
        );
        ui.text(
          `  ${chalk.bold("Start Time:")}  ${formatLocalTimestamp(new Date(startTime))}`,
        );
        ui.text(
          `  ${chalk.bold("Last Active:")} ${formatLocalTimestampWithRelative(agent.lastActive)}`,
        );
        ui.text(
          `  ${chalk.bold("Status:")}      ${formatStatus(agent.status)}`,
        );
        ui.text(`  ${chalk.bold("Type:")}        ${agentTypeLabel(agent.type)}`);
        ui.breakline();
        renderConversationDetail(
          displayMessages,
          conversation.length,
          isTruncated,
        );
      }),
    );
}
