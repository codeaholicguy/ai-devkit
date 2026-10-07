import os from "os";
import chalk from "chalk";
import {
  AgentStatus,
  type ConversationMessage,
  type DurableProvider,
} from "@ai-devkit/agent-manager";
import { ui } from "../../util/terminal-ui.js";
import {
  formatLocalTimestamp,
  formatRelativeTime,
} from "../../util/time-format.js";

const STATUS_DISPLAY: Record<
  AgentStatus,
  { label: string; color: (text: string) => string }
> = {
  [AgentStatus.RUNNING]: { label: "Running", color: chalk.green },
  [AgentStatus.WAITING]: { label: "Waiting", color: chalk.yellow },
  [AgentStatus.IDLE]: { label: "Idle", color: chalk.dim },
  [AgentStatus.UNKNOWN]: { label: "Unknown", color: chalk.gray },
};

export function formatStatus(status: AgentStatus): string {
  const config = STATUS_DISPLAY[status] || STATUS_DISPLAY[AgentStatus.UNKNOWN];
  return config.label;
}

export function colorStatus(statusLabel: string): string {
  const display = Object.values(STATUS_DISPLAY).find(
    (value) => value.label === statusLabel,
  );
  return (display ?? STATUS_DISPLAY[AgentStatus.UNKNOWN]).color(statusLabel);
}

export function formatCwd(projectPath?: string): string {
  if (!projectPath) return "";
  const home = os.homedir();
  if (projectPath.startsWith(home)) {
    return "~" + projectPath.slice(home.length);
  }
  return projectPath;
}

export function formatSeparator(): string {
  const width = process.stdout.columns ?? 80;
  return "─".repeat(Math.max(40, Math.min(120, width - 2)));
}

export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return count === 1 ? singular : plural;
}

export function formatWorkOn(
  summary: string | undefined,
  agentName?: string,
): string {
  const lines = (summary ?? "").split(/\r?\n/);
  const firstLine = lines[0] || "";
  const hasHiddenLines =
    lines.length > 1 && lines.slice(1).some((line) => line.trim() !== "");
  if (firstLine && hasHiddenLines && agentName) {
    return `${firstLine} … Use \`ai-devkit agent detail --id ${agentName}\`.`;
  }
  return firstLine || "No active task";
}

export function resolveTailCount(
  raw: string | undefined,
  fallback = 20,
): number {
  const parsed = parseInt(raw ?? String(fallback), 10);
  return Number.isNaN(parsed) || parsed < 1 ? fallback : parsed;
}

export function selectConversationMessages(
  conversation: ConversationMessage[],
  options: { full?: boolean; tail?: string },
): { displayMessages: ConversationMessage[]; isTruncated: boolean } {
  const tailCount = options.full
    ? conversation.length
    : resolveTailCount(options.tail);
  const displayMessages = conversation.slice(-tailCount);
  return {
    displayMessages,
    isTruncated: displayMessages.length < conversation.length,
  };
}

export function renderConversationDetail(
  displayMessages: ConversationMessage[],
  totalMessages: number,
  isTruncated: boolean,
  options: { localClock?: boolean; widthDerivedSeparator?: boolean } = {},
): void {
  const label = isTruncated
    ? `Conversation (last ${displayMessages.length} of ${totalMessages} ${pluralize(totalMessages, "message")})`
    : `Conversation (${displayMessages.length} ${pluralize(displayMessages.length, "message")})`;
  ui.text(label, { breakline: false });
  ui.text(
    chalk.dim(
      options.widthDerivedSeparator ? formatSeparator() : "─".repeat(40),
    ),
  );

  for (const msg of displayMessages) {
    const time = msg.timestamp
      ? chalk.dim(
          `[${options.localClock ? formatLocalTimestamp(new Date(msg.timestamp)) : new Date(msg.timestamp).toLocaleTimeString()}]`,
        )
      : "";
    const roleColor =
      msg.role === "user"
        ? chalk.green
        : msg.role === "assistant"
          ? chalk.cyan
          : chalk.yellow;
    ui.text(`${time} ${roleColor(msg.role + ":")}`);
    const lines = msg.content.split("\n");
    for (const line of lines) {
      ui.text(`  ${line}`);
    }
    ui.breakline();
  }

  if (isTruncated) {
    ui.info(
      `Showing last ${displayMessages.length} of ${totalMessages} messages. Use --full to see all.`,
    );
  }
}

export function formatPrintProvider(provider: DurableProvider): string {
  if (provider === "codex") return "Codex";
  return provider === "pi" ? "Pi" : "Claude Code";
}
