import chalk from "chalk";
import { ui } from "../../util/terminal-ui.js";
import {
  colorStatus,
  getStatusDisplay,
  getStatusKeyByLabel,
  type StatusKey,
} from "../../util/status.js";
import { formatRelativeOrAbsoluteTime } from "../../util/time-format.js";
import { pluralize } from "../../util/pluralize.js";
import type { CapacityReport, CapacityWindow } from "@ai-devkit/agent-manager";

const BAR_WIDTH = 10;
const ELEVATED_USAGE = 70;
const HIGH_USAGE = 90;
const PROVIDER_LABELS: Record<string, string> = {
  zai: "z.ai",
  openai: "OpenAI",
};

export type RenderCapacityOptions = { json?: boolean; now?: () => Date };

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

function percent(value: number | null): string {
  if (value === null) return "unknown";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function reportStatus(report: CapacityReport): StatusKey {
  if (report.authenticated === false) return "not-authenticated";
  if (report.available === "no") return "exhausted";
  if (report.available === "unknown") return "unknown";
  const maxUsed = report.windows.reduce(
    (max, window) => Math.max(max, window.usedPercent ?? 0),
    0,
  );
  return maxUsed >= HIGH_USAGE ? "limited" : "ok";
}

function statusStyle(text: string): string {
  return colorStatus(getStatusKeyByLabel(text), text);
}

function usageStyle(text: string): string {
  const match = /(\d+(?:\.\d+)?)%/.exec(text);
  if (!match) return chalk.dim(text);
  const used = Number(match[1]);
  if (used >= HIGH_USAGE) return chalk.red(text);
  if (used >= ELEVATED_USAGE) return chalk.yellow(text);
  return chalk.green(text);
}

function usageCell(window: CapacityWindow): string {
  if (window.usedPercent === null) return "unknown";
  const filled = Math.min(
    BAR_WIDTH,
    Math.ceil(window.usedPercent / (100 / BAR_WIDTH)),
  );
  const bar = `${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)}`;
  let cell = `${bar} ${percent(window.usedPercent)}`;
  if (typeof window.total === "number") {
    const used =
      typeof window.remaining === "number"
        ? window.total - window.remaining
        : typeof window.current === "number"
          ? window.current
          : null;
    if (used !== null) cell += ` · ${used}/${window.total}`;
  }
  return cell;
}

function resetLabel(resetsAt: string | null | undefined, now: Date): string {
  if (!resetsAt) return "—";
  if (new Date(resetsAt).getTime() <= now.getTime()) return "now";
  return formatRelativeOrAbsoluteTime(resetsAt, { now: () => now });
}

function sortedWindows(windows: CapacityWindow[]): CapacityWindow[] {
  return windows
    .slice()
    .sort(
      (left, right) =>
        (left.durationMinutes ?? Number.MAX_SAFE_INTEGER) -
        (right.durationMinutes ?? Number.MAX_SAFE_INTEGER),
    );
}

function reportRows(report: CapacityReport, now: Date): string[][] {
  const status = reportStatus(report);
  const statusLabel = getStatusDisplay(status).label;
  const windows = sortedWindows(report.windows);
  if (windows.length === 0) {
    return [
      [
        report.harness,
        providerLabel(report.provider),
        statusLabel,
        "—",
        "—",
        "—",
      ],
    ];
  }
  return windows.map((window) => [
    report.harness,
    providerLabel(report.provider),
    statusLabel,
    window.label,
    usageCell(window),
    resetLabel(window.resetsAt, now),
  ]);
}

function renderCredits(reports: CapacityReport[]): void {
  for (const report of reports) {
    if (
      report.creditsRemaining === null ||
      report.creditsRemaining === undefined
    )
      continue;
    const identity = `${report.harness} · ${providerLabel(report.provider)}`;
    ui.text(
      chalk.dim(`  ${identity}: ${report.creditsRemaining} credits remaining`),
    );
  }
}

export function renderCapacityReports(
  reports: CapacityReport[],
  options: RenderCapacityOptions = {},
): void {
  if (options.json) {
    console.log(
      JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2),
    );
    return;
  }
  if (reports.length === 0) return;

  const now = options.now?.() ?? new Date();
  if (reports.length === 1) {
    const report = reports[0];
    const status = reportStatus(report);
    const identity = chalk.bold(
      `${report.harness} · ${providerLabel(report.provider)}`,
    );
    ui.breakline();
    ui.text(
      `${identity} capacity · ${colorStatus(
        status,
        getStatusDisplay(status).label,
      )}`,
    );
    if (report.windows.length === 0) {
      ui.text(chalk.dim("  No usage windows reported."));
    } else {
      ui.table({
        headers: ["Quota", "Usage", "Resets"],
        rows: sortedWindows(report.windows).map((window) => [
          window.label,
          usageCell(window),
          resetLabel(window.resetsAt, now),
        ]),
        maxWidth: process.stdout.columns ?? 120,
        columnStyles: [
          (text) => chalk.cyan(text),
          usageStyle,
          (text) => chalk.dim(text),
        ],
      });
    }
    renderCredits([report]);
    return;
  }

  ui.breakline();
  ui.text(chalk.bold(`Capacity · ${pluralize(reports.length, "provider")}`));
  ui.table({
    headers: ["Harness", "Provider", "Status", "Quota", "Usage", "Resets"],
    rows: reports.flatMap((report) => reportRows(report, now)),
    maxWidth: process.stdout.columns ?? 120,
    columnStyles: [
      (text) => chalk.cyan(text),
      (text) => chalk.cyan(text),
      statusStyle,
      (text) => text,
      usageStyle,
      (text) => chalk.dim(text),
    ],
  });
  renderCredits(reports);
}
