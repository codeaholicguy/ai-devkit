import { Command } from "commander";
import {
  AgentRegistry,
  RenameNotFoundError,
  RenameConflictError,
} from "@ai-devkit/agent-manager";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { AGENT_NAME_REGEX } from "../../util/agent.js";

export function registerAgentRenameCommand(agentCommand: Command): void {
  agentCommand
    .command("rename <current-name> <new-name>")
    .description("Rename an agent in the registry")
    .action(
      withErrorHandler(
        "rename agent",
        async (currentName: string, newName: string) => {
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

          try {
            AgentRegistry.default().rename(currentName, newName);
            ui.success(`Agent "${currentName}" renamed to "${newName}".`);
          } catch (err) {
            if (err instanceof RenameNotFoundError) {
              ui.error(err.message);
            } else if (err instanceof RenameConflictError) {
              ui.error(
                `Agent "${err.agentName}" is already in use. Choose a different name.`,
              );
            } else {
              throw err;
            }
            process.exit(1);
          }
        },
      ),
    );
}
