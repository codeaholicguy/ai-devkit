import path from "path";
import { Command } from "commander";
import chalk from "chalk";
import { AGENT_MODES, AgentStatus } from "@ai-devkit/agent-manager";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { agentTypeLabel } from "../../util/agent.js";
import { pluralize } from "../../util/pluralize.js";
import { formatRelativeTime } from "../../util/time-format.js";
import { createAgentManager, createDurableAgentService } from "./factory.js";
import {
  colorStatus,
  formatStatus,
  formatWorkOn,
} from "./render.js";

export function registerAgentListCommand(agentCommand: Command): void {
  agentCommand
    .command("list")
    .description("List all running AI agents")
    .option("-j, --json", "Output as JSON")
    .action(
      withErrorHandler("list agents", async (options) => {
        const manager = createAgentManager();
        const agents = await manager.listAgents();
        const durableAgents =
          await createDurableAgentService().repository.list();

        if (options.json) {
          const output = [
            ...agents.map((agent) => ({
              ...agent,
              mode: AGENT_MODES.INTERACTIVE,
            })),
            ...durableAgents.map((agent) => ({
              ...agent,
              mode: AGENT_MODES.DURABLE,
            })),
          ];
          console.log(JSON.stringify(output, null, 2));
          return;
        }

        if (agents.length === 0 && durableAgents.length === 0) {
          ui.info("No running agents detected.");
          return;
        }

        const maxWidth = process.stdout.columns ?? 120;
        const now = new Date(Date.now());

        if (agents.length > 0) {
          ui.text("Interactive Agents:", { breakline: true });
          ui.table({
            headers: [
              "Agent",
              "Project",
              "Type",
              "Mode",
              "Status",
              "Working On",
              "Active",
            ],
            rows: agents.map((agent) => [
              agent.name,
              agent.projectPath ? path.basename(agent.projectPath) : "",
              agentTypeLabel(agent.type),
              AGENT_MODES.INTERACTIVE,
              formatStatus(agent.status),
              formatWorkOn(agent.summary, agent.name),
              formatRelativeTime(agent.lastActive, now),
            ]),
            maxWidth,
            columnStyles: [
              (text) => chalk.cyan(text),
              (text) => chalk.dim(text),
              (text) => chalk.dim(text),
              (text) => chalk.dim(text),
              colorStatus,
              (text) => text,
              (text) => chalk.dim(text),
            ],
          });
        }

        if (durableAgents.length > 0) {
          if (agents.length > 0) {
            ui.breakline();
          }
          ui.text("Durable Agents:", { breakline: true });
          ui.table({
            headers: [
              "Agent",
              "Project",
              "Provider",
              "Mode",
              "State",
              "Session",
              "Active",
            ],
            rows: durableAgents.map((agent) => [
              agent.name,
              path.basename(agent.cwd),
              agentTypeLabel(agent.provider),
              AGENT_MODES.DURABLE,
              agent.state,
              agent.lastResult?.summary ?? agent.sessionHealth,
              agent.lastActiveAt
                ? formatRelativeTime(new Date(agent.lastActiveAt), now)
                : "never",
            ]),
            maxWidth,
            columnStyles: [
              (text) => chalk.cyan(text),
              (text) => chalk.dim(text),
              (text) => chalk.dim(text),
              (text) => chalk.dim(text),
              (text) => text,
              (text) => text,
              (text) => chalk.dim(text),
            ],
          });
        }

        const waitingCount = agents.filter(
          (a) => a.status === AgentStatus.WAITING,
        ).length;
        if (waitingCount > 0) {
          ui.breakline();
          ui.warning(
            `${pluralize(waitingCount, "agent")} waiting for input.`,
          );
        }
      }),
    );
}
