import { Command } from "commander";
import { select } from "@inquirer/prompts";
import {
  AgentRegistry,
  focusAgent,
  TerminalFocusManager,
} from "@ai-devkit/agent-manager";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { enableDebug, createLogger } from "../../util/debug.js";
import {
  resolveAgentByName,
  reportAgentResolution,
} from "../../services/agent/resolve-agent.service.js";
import { createAgentManager } from "./factory.js";
import { formatStatus } from "./render.js";

export function registerAgentOpenCommand(agentCommand: Command): void {
  agentCommand
    .command("open <name>")
    .description("Focus a running agent terminal")
    .option("--debug", "Trace how the agent terminal is resolved and focused")
    .action(
      withErrorHandler("open agent", async (name, options) => {
        const terminalLogger = options.debug
          ? createLogger("terminal")
          : undefined;
        if (options.debug) {
          enableDebug();
        }
        const manager = createAgentManager();
        // When --debug is set, route the focus manager's decision trace to
        // the ai-devkit:terminal debug logger (enabled above) so users can
        // see which terminal matched and how focus was attempted.
        const focusManager = new TerminalFocusManager(
          terminalLogger
            ? (message: string) => terminalLogger(message)
            : undefined,
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

        if (!agent.pid) {
          ui.error(`Cannot focus agent "${agent.name}" (No PID found).`);
          return;
        }

        const spinner = ui.spinner(`Switching focus to ${agent.name}...`);
        spinner.start();

        const focusResult = await focusAgent(agent, {
          registry: AgentRegistry.default(),
          focusManager,
        });
        if (
          !focusResult.focused &&
          focusResult.reason === "terminal-not-found"
        ) {
          spinner.fail(
            `Could not find terminal window for agent "${agent.name}" (PID: ${agent.pid}).`,
          );
          return;
        }
        if (!focusResult.focused) {
          spinner.fail(`Failed to switch focus to "${agent.name}".`);
          return;
        }

        spinner.succeed(`Focused ${agent.name}!`);
      }),
    );
}
