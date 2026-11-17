import { Command } from "commander";
import chalk from "chalk";
import { AGENT_TYPES, type SessionSummary } from "@ai-devkit/agent-manager";
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
import { createAgentManager, createDurableAgentService } from "./factory.js";
import { formatCwd } from "./render.js";

export function registerAgentSessionsCommand(agentCommand: Command): void {
  agentCommand
    .command("sessions")
    .description("List historical Claude/Codex/Gemini/Grok/Kiro/OpenCode/Devin sessions for resume")
    .option("--all", "Include sessions from every cwd (default: only current cwd)")
    .option("--cwd <path>", "Override the cwd filter (implies non-default scope)")
    .option("--type <type>", `Filter to one of: ${AGENT_TYPES.join(", ")}`)
    .option("--limit <n>", "Max rows to print (default: 50; 0 = no limit)", "50")
    .option("-j, --json", "Output as JSON")
    .action(
      withErrorHandler("list sessions", async (options) => {
        const opts = resolveListSessionsOptions(options);
        const manager = createAgentManager();
        let sessions: Array<
          SessionSummary & { mode?: "durable"; durableId?: string; name?: string; state?: string }
        > = await manager.listSessions(opts.adapterOptions);

        const durable = (await createDurableAgentService().repository.list()).filter(
          (a) =>
            (!opts.adapterOptions.type || opts.adapterOptions.type === a.provider) &&
            (!opts.adapterOptions.cwd || opts.adapterOptions.cwd === a.cwd),
        );
        const durableSessions = durable.map((a) => {
          const historical = sessions.find(
            (s) => s.type === a.provider && s.sessionId === a.providerSessionId,
          );
          return {
            type: a.provider,
            sessionId: a.providerSessionId ?? a.id,
            cwd: a.cwd,
            firstUserMessage: historical?.firstUserMessage ?? "",
            startedAt: historical?.startedAt ?? new Date(a.createdAt),
            lastActive: new Date(
              Math.max(
                historical?.lastActive.getTime() ?? 0,
                new Date(a.lastActiveAt ?? a.updatedAt).getTime(),
              ),
            ),
            sessionFilePath: historical?.sessionFilePath ?? "",
            mode: "durable" as const,
            durableId: a.id,
            name: a.name,
            state: a.state,
          };
        });
        sessions = [
          ...sessions.filter(
            (s) => !durableSessions.some((d) => d.type === s.type && d.sessionId === s.sessionId),
          ),
          ...durableSessions,
        ].sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());
        const limit = parseLimit(options.limit);
        if (limit !== undefined) {
          sessions = sessions.slice(0, limit);
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              sessions.map((s) => ({
                ...toJsonSession(s),
                ...(s.durableId !== undefined
                  ? {
                      mode: "durable",
                      durableId: s.durableId,
                      name: s.name,
                      state: s.state,
                    }
                  : {}),
              })),
              null,
              2,
            ),
          );
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
          headers: ["Type", "Session ID", "CWD", "First Message", "Last Active"],
          rows: sessions.map((s) => [
            `${agentTypeLabel(s.type)}${s.mode === "durable" ? " (durable)" : ""}`,
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
