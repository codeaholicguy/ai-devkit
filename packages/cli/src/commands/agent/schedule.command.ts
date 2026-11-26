import { Command } from "commander";
import chalk from "chalk";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { createLogger, enableDebug } from "../../util/debug.js";
import { formatRelativeOrAbsoluteTime } from "../../util/time-format.js";
import {
  createDefaultAgentScheduleService,
  type ScheduledSend,
} from "../../services/agent/agent-schedule.service.js";

const debug = createLogger("agent:schedule");

function scheduleService(options?: { debug?: boolean }) {
  if (options?.debug) {
    enableDebug();
  }
  return createDefaultAgentScheduleService({ onDebug: debug });
}

function colorScheduleStatus(status: string): string {
  switch (status) {
    case "pending":
      return chalk.yellow(status);
    case "sent":
      return chalk.green(status);
    case "late":
      return chalk.cyan(status);
    case "failed":
      return chalk.red(status);
    case "cancelled":
    case "skipped":
      return chalk.dim(status);
    default:
      return status;
  }
}

function formatMessagePreview(schedule: ScheduledSend): string {
  const singleLine = schedule.message.replace(/\s+/g, " ").trim();
  const preview = singleLine.length > 60 ? `${singleLine.slice(0, 57)}...` : singleLine;
  if (schedule.failureReason) {
    return `${preview} (${schedule.failureReason})`;
  }
  return preview;
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid --limit "${value}". Expected a positive integer.`);
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`Invalid --limit "${value}". Expected a positive integer.`);
  }
  return n;
}

export function registerAgentScheduleCommand(agentCommand: Command): void {
  const scheduleCommand = agentCommand
    .command("schedule")
    .description("List and manage scheduled agent sends");

  scheduleCommand
    .command("list")
    .description("List scheduled agent sends")
    .option(
      "--status <status>",
      "Filter by status (pending, sent, late, cancelled, failed, skipped)",
    )
    .option("--agent <name>", "Filter by target agent name")
    .option("--limit <count>", "Maximum number of rows to return (default: 50, max: 500)")
    .option("-j, --json", "Output as JSON")
    .option("--debug", "Enable debug logging")
    .action(
      withErrorHandler(
        "list scheduled sends",
        async (options: {
          status?: string;
          agent?: string;
          limit?: string;
          json?: boolean;
          debug?: boolean;
        }) => {
          const limit = parseLimit(options.limit);
          const schedules = await scheduleService(options).list({
            ...(options.status ? { status: options.status } : {}),
            ...(options.agent ? { agentName: options.agent } : {}),
            ...(limit !== undefined ? { limit } : {}),
          });

          if (options.json) {
            console.log(JSON.stringify(schedules, null, 2));
            return;
          }

          if (schedules.length === 0) {
            ui.info("No scheduled sends.");
            return;
          }

          const maxWidth = process.stdout.columns ?? 120;
          ui.table({
            headers: ["ID", "Agent", "Status", "Due", "Message"],
            rows: schedules.map((item) => [
              item.id,
              item.agentName,
              item.status,
              formatRelativeOrAbsoluteTime(item.dueAt),
              formatMessagePreview(item),
            ]),
            maxWidth,
            columnStyles: [
              (text) => chalk.dim(text),
              (text) => chalk.cyan(text),
              colorScheduleStatus,
              (text) => chalk.dim(text),
              (text) => text,
            ],
          });
        },
      ),
    );

  scheduleCommand
    .command("cancel <id>")
    .description("Cancel a pending scheduled send")
    .option("-j, --json", "Output as JSON")
    .option("--debug", "Enable debug logging")
    .action(
      withErrorHandler(
        "cancel scheduled send",
        async (id: string, options: { json?: boolean; debug?: boolean }) => {
          const cancelled = await scheduleService(options).cancel(id);
          if (options.json) {
            console.log(JSON.stringify(cancelled, null, 2));
            return;
          }
          ui.success(`Cancelled scheduled send "${cancelled.id}" for "${cancelled.agentName}".`);
        },
      ),
    );
}
