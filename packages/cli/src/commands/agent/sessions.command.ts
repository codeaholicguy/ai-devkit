import { Command } from "commander";
import chalk from "chalk";
import { AGENT_TYPES } from "@ai-devkit/agent-manager";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import {
  formatFirstMessage,
  parseLimit,
  resolveListSessionsOptions,
  toJsonSession,
} from "../../util/sessions.js";
import { agentTypeLabel } from "../../util/agent.js";
import { formatRelativeTime } from "../../util/time-format.js";
import { createAgentManager } from "./factory.js";
import { formatCwd } from "./render.js";

export function registerAgentSessionsCommand(agentCommand: Command): void {
  agentCommand
    .command("sessions")
    .description(
      "List historical Claude/Codex/Gemini/Grok/Kiro/OpenCode/Devin sessions for resume",
    )
    .option(
      "--all",
      "Include sessions from every cwd (default: only current cwd)",
    )
    .option(
      "--cwd <path>",
      "Override the cwd filter (implies non-default scope)",
    )
    .option(
      "--type <type>",
      `Filter to one of: ${AGENT_TYPES.join(", ")}`,
    )
    .option(
      "--limit <n>",
      "Max rows to print (default: 50; 0 = no limit)",
      "50",
    )
    .option("-j, --json", "Output as JSON")
    .action(
      withErrorHandler("list sessions", async (options) => {
        const opts = resolveListSessionsOptions(options);
        const manager = createAgentManager();
        let sessions = await manager.listSessions(opts.adapterOptions);

        const limit = parseLimit(options.limit);
        if (limit !== undefined) {
          sessions = sessions.slice(0, limit);
        }

        if (options.json) {
          console.log(JSON.stringify(sessions.map(toJsonSession), null, 2));
          return;
        }

        if (sessions.length === 0) {
          ui.info(
            opts.usedDefaultCwd
              ? `No sessions found for ${formatCwd(opts.adapterOptions.cwd)}. Use --all to broaden.`
              : "No sessions found.",
          );
          return;
        }

        ui.text("Sessions:", { breakline: true });
        ui.table({
          headers: [
            "Type",
            "Session ID",
            "CWD",
            "First Message",
            "Last Active",
          ],
          rows: sessions.map((s) => [
            agentTypeLabel(s.type),
            s.sessionId,
            formatCwd(s.cwd),
            formatFirstMessage(s.firstUserMessage),
            formatRelativeTime(s.lastActive),
          ]),
          columnStyles: [
            (text) => chalk.dim(text),
            (text) => chalk.cyan(text),
            (text) => chalk.dim(text),
            (text) => text,
            (text) => chalk.dim(text),
          ],
        });
      }),
    );
}
