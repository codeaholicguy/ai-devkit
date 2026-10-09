import { Command } from "commander";
import chalk from "chalk";
import { AGENT_TYPES } from "@ai-devkit/agent-manager";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { resolveListSessionsOptions } from "../../util/sessions.js";
import { agentTypeLabel } from "../../util/agent.js";
import { formatRelativeTime } from "../../util/time-format.js";
import {
  JEV_UNAVAILABLE_MESSAGE,
  JEV_UNAVAILABLE_REASON,
} from "../../services/session-compact/session-compact.types.js";
import { createAgentManager } from "./factory.js";
import {
  formatCwd,
  renderConversationDetail,
  selectConversationMessages,
} from "./render.js";

export function registerAgentSessionCommand(agentCommand: Command): void {
  const sessionCommand = agentCommand
    .command("session")
    .description("Manage historical AI agent sessions");

  sessionCommand
    .command("detail")
    .description("Show detailed information about a historical session")
    .requiredOption(
      "--id <sessionId>",
      "Session ID (as shown in agent sessions)",
    )
    .option("-j, --json", "Output as JSON")
    .option(
      "--type <type>",
      `Filter to one of: ${AGENT_TYPES.join(", ")}`,
    )
    .option("--full", "Show entire conversation history")
    .option("--tail <n>", "Show last N messages (default: 20)", "20")
    .option("--verbose", "Include tool call/result details")
    .action(
      withErrorHandler("get session detail", async (options) => {
        const manager = createAgentManager();
        // Validates --type; the ID lookup avoids listing every session.
        const { type } = resolveListSessionsOptions({
          all: true,
          type: options.type,
        }).adapterOptions;
        const matches = await manager.findSessionsById(options.id, { type });

        if (matches.length === 0) {
          ui.error(`No session found matching "${options.id}".`);
          return;
        }

        if (matches.length > 1) {
          ui.error(`Multiple sessions match "${options.id}":`);
          matches.forEach((session) => {
            ui.text(
              `  - ${agentTypeLabel(session.type)} ${formatCwd(session.cwd)}`,
            );
          });
          ui.info("Use --type to choose the intended session source.");
          return;
        }

        const session = matches[0];
        const adapter = manager.getAdapter(session.type);
        if (!adapter) {
          ui.error(`Unsupported agent type: ${session.type}`);
          return;
        }

        const conversation = adapter.getConversation(session.sessionFilePath, {
          verbose: options.verbose,
        });
        const { displayMessages, isTruncated } = selectConversationMessages(
          conversation,
          options,
        );

        if (options.json) {
          const output = {
            sessionId: session.sessionId,
            cwd: session.cwd,
            startTime: session.startedAt,
            lastActive: session.lastActive,
            type: session.type,
            sessionFilePath: session.sessionFilePath,
            conversation: displayMessages,
          };
          console.log(JSON.stringify(output, null, 2));
          return;
        }

        ui.text("Session Detail", { breakline: true });
        ui.text(chalk.dim("─".repeat(40)));
        ui.text(`  ${chalk.bold("Session ID:")}  ${session.sessionId}`);
        ui.text(`  ${chalk.bold("CWD:")}         ${formatCwd(session.cwd)}`);
        ui.text(
          `  ${chalk.bold("Start Time:")}  ${session.startedAt.toLocaleString()}`,
        );
        ui.text(
          `  ${chalk.bold("Last Active:")} ${formatRelativeTime(session.lastActive)}`,
        );
        ui.text(`  ${chalk.bold("Type:")}        ${agentTypeLabel(session.type)}`);
        ui.text(`  ${chalk.bold("File:")}        ${session.sessionFilePath}`);
        ui.breakline();
        renderConversationDetail(
          displayMessages,
          conversation.length,
          isTruncated,
          { localClock: true, widthDerivedSeparator: true },
        );
      }),
    );

  sessionCommand
    .command("compact")
    .description("Compact a historical session into a Jev-classified continuation artifact")
    .requiredOption("--id <sessionId>", "Session ID (as shown in agent sessions)")
    .option(
      "--type <type>",
      `Filter to one of: ${AGENT_TYPES.join(", ")}`,
    )
    .option("--format <format>", "Output format: markdown or json", "markdown")
    .action(
      withErrorHandler("compact session", async (options) => {
        if (options.format !== "markdown" && options.format !== "json") {
          throw new Error("Invalid --format. Expected markdown or json.");
        }

        const apiKey = process.env.TYPESAFE_API_KEY?.trim();
        if (!apiKey) {
          if (options.format === "json") {
            console.log(
              JSON.stringify(
                { jev: { available: false, reason: JEV_UNAVAILABLE_REASON } },
                null,
                2,
              ),
            );
          } else {
            console.log(JEV_UNAVAILABLE_MESSAGE);
          }
          return;
        }

        const manager = createAgentManager();
        const matches = await manager.findSessionsById(options.id, { type: options.type });
        if (matches.length === 0) {
          throw new Error(`No session found matching "${options.id}".`);
        }
        if (matches.length > 1) {
          throw new Error(
            `Multiple sessions match "${options.id}". Use --type to choose the intended session source.`,
          );
        }
        const resolved = matches[0];

        const adapter = manager.getAdapter(resolved.type);
        if (!adapter) throw new Error(`Unsupported agent type: ${resolved.type}`);

        const conversation = adapter.getConversation(resolved.sessionFilePath, { verbose: true });
        // The Jev classifier pulls in the TypeSafe SDK (undici) — lazy-load
        // so plain session browsing skips it.
        const [{ compactSession, renderSessionCompactMarkdown }, { createJevSessionEventClassifier }] =
          await Promise.all([
            import("../../services/session-compact/session-compact.service.js"),
            import("../../services/session-compact/jev-classifier.js"),
          ]);
        const classifier = createJevSessionEventClassifier(apiKey);
        const result = await compactSession(conversation, classifier);
        console.log(
          options.format === "json"
            ? JSON.stringify(result, null, 2)
            : renderSessionCompactMarkdown(result),
        );
      }),
    );
}
