import { Command } from "commander";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
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
        // The TUI pulls in react/ink/yoga — keep it out of the eager graph
        // so non-TUI commands don't pay the module cost.
        const [{ default: React }, { render }, { AGENT_CONSOLE_RENDER_OPTIONS, ConsoleApp }] =
          await Promise.all([
            import("react"),
            import("ink"),
            import("../../tui/console/ConsoleApp.js"),
          ]);
        const manager = createAgentManager();
        const { waitUntilExit } = render(
          React.createElement(ConsoleApp, { manager }),
          AGENT_CONSOLE_RENDER_OPTIONS,
        );
        await waitUntilExit();
      }),
    );
}
