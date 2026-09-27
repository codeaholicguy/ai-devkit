import chalk from "chalk";
import type {
  AgentReadinessReport,
  ReadinessAgentType,
} from "@ai-devkit/agent-manager";
import { ui } from "../../util/terminal-ui.js";
import type {
  CheckStatus,
  StatusReport,
} from "../../services/status/status.service.js";

const STATUS_STYLES: Record<string, (text: string) => string> = {
  ready: chalk.green,
  pass: chalk.green,
  "not ready": chalk.yellow,
  warn: chalk.yellow,
  fail: chalk.red,
  info: chalk.blue,
};

const CHECK_LABELS: Record<CheckStatus | "info", string> = {
  pass: "ready",
  warn: "not ready",
  fail: "fail",
  info: "info",
};

function statusStyle(text: string): string {
  return (STATUS_STYLES[text] ?? chalk.dim)(text);
}

function statusLabel(status: CheckStatus | "info"): string {
  return CHECK_LABELS[status];
}

function installed(value: boolean): string {
  return value ? "installed" : "not installed";
}

function authEvidence(auth: NonNullable<AgentReadinessReport["auth"]>): string {
  return auth.provider ?? auth.state;
}

function agentEntries(
  report: StatusReport,
): Array<[ReadinessAgentType, AgentReadinessReport]> {
  return (
    Object.entries(report.agents) as Array<
      [ReadinessAgentType, AgentReadinessReport]
    >
  ).filter(([, agent]) => agent.executable.path !== null);
}

function displayPath(target: string | null): string {
  if (target === null) return "not found";
  const homeDir = process.env.HOME;
  if (!homeDir) return target;
  return target === homeDir
    ? "~"
    : target.startsWith(`${homeDir}/`)
      ? `~${target.slice(homeDir.length)}`
      : target;
}

function checkRows(report: StatusReport): Array<[string, string, string]> {
  const details: Array<[string, string, string]> = [];
  for (const [agent, item] of agentEntries(report)) {
    details.push(
      [
        `${agent}: executable`,
        statusLabel(item.executable.status),
        displayPath(item.executable.path),
      ],
      [
        `${agent}: config`,
        statusLabel(item.globalConfig.status),
        displayPath(item.globalConfig.path),
      ],
      [
        `${agent}: ai-devkit built-in skills`,
        statusLabel(item.builtInSkills.status),
        `${item.builtInSkills.present}/${item.builtInSkills.required}`,
      ],
    );
    if (item.auth) {
      details.push([
        `${agent}: auth`,
        statusLabel(item.auth.status),
        authEvidence(item.auth),
      ]);
      if (item.auth.availableProviders.length) {
        details.push([
          `${agent}: providers`,
          "info",
          item.auth.availableProviders.join(", "),
        ]);
      }
    }
    if (item.integration) {
      details.push([
        `${agent}: ${item.integration.label}`,
        statusLabel(item.integration.status),
        installed(item.integration.installed),
      ]);
    }
  }
  return details;
}

function overallDetails(details: Array<[string, string, string]>): string {
  return [
    `${reportStatusCount(details, "ready")} ready`,
    `${reportStatusCount(details, "not ready")} not ready`,
    `${reportStatusCount(details, "fail")} fail`,
    `${reportStatusCount(details, "info")} info`,
  ].join(" · ");
}

function reportStatusCount(
  details: Array<[string, string, string]>,
  status: string,
): number {
  return details.filter(([, itemStatus]) => itemStatus === status).length;
}

export function renderStatusReport(
  report: StatusReport,
  options: { json?: boolean } = {},
): void {
  if (options.json) {
    ui.text(JSON.stringify(report, null, 2));
    return;
  }

  const agents = agentEntries(report);
  const details = checkRows(report);
  ui.text("AI DevKit Status:", { breakline: true });
  ui.table({
    headers: ["Scope", "Status", "Details"],
    rows: [
      ["overall", statusLabel(report.overall), overallDetails(details)],
      [
        "ai-devkit",
        statusLabel(report.aiDevkit.status),
        report.aiDevkit.latestVersion
          ? `${report.aiDevkit.installedVersion} (latest ${report.aiDevkit.latestVersion})`
          : `${report.aiDevkit.installedVersion} (latest unknown)`,
      ],
      [
        "project",
        statusLabel(report.project.config.status),
        displayPath(report.project.config.path),
      ],
      [
        "tmux",
        statusLabel(report.tmux.status),
        report.tmux.available
          ? `${displayPath(report.tmux.path)} · ${report.tmux.version ?? "unknown"}`
          : "unavailable",
      ],
      [
        "registries",
        "info",
        `${Object.keys(report.registries.project.configured).length} project · ${Object.keys(report.registries.global.configured).length} global`,
      ],
      [
        "channels",
        "info",
        `${report.channels.readyCount}/${report.channels.connections.length} ready`,
      ],
    ],
    maxWidth: process.stdout.columns ?? 120,
    columnStyles: [chalk.cyan, statusStyle, chalk.dim],
  });

  ui.text("Agents:", { breakline: true });
  if (agents.length === 0) {
    ui.text(chalk.dim("No executable agents found on PATH."), {
      breakline: true,
    });
  } else {
    ui.table({
      headers: ["Agent", "Status"],
      rows: agents.map(([agent, item]) => [agent, statusLabel(item.status)]),
      maxWidth: process.stdout.columns ?? 120,
      columnStyles: [chalk.cyan, statusStyle],
    });
  }

  ui.text("Checks:", { breakline: true });
  ui.table({
    headers: ["Check", "Status", "Evidence"],
    rows: details,
    maxWidth: process.stdout.columns ?? 120,
    columnStyles: [chalk.cyan, statusStyle, chalk.dim],
  });
}
