import { Command } from "commander";
import { createElement } from "react";
import { render } from "ink";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import {
  AGENT_CONSOLE_RENDER_OPTIONS,
  ConsoleApp,
} from "../../tui/console/ConsoleApp.js";
import { createAgentManager } from "./factory.js";

export function registerAgentConsoleCommand(agentCommand: Command): void {
  agentCommand
    .command("console")
    .description("Interactive multi-agent console (open, message, monitor)")
    .action(
      withErrorHandler("agent console", async () => {
        if (!process.stdout.isTTY) {
          ui.error("agent console requires an interactive terminal (TTY).");
          process.exit(1);
        }
        const manager = createAgentManager();
        const { waitUntilExit } = render(
          createElement(ConsoleApp, { manager }),
          AGENT_CONSOLE_RENDER_OPTIONS,
        );
        await waitUntilExit();
      }),
    );
}
