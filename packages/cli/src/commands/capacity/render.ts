import chalk from "chalk";
import { ui } from "../../util/terminal-ui.js";
import type { CapacityReport, CapacityWindow } from "@ai-devkit/agent-manager";

const BAR_WIDTH = 10;
const ELEVATED_USAGE = 70;
const HIGH_USAGE = 90;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
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

type ReportStatus = keyof typeof STATUS_STYLES;

const STATUS_STYLES = {
  OK: chalk.green,
  LIMITED: chalk.yellow,
  "NOT AUTHENTICATED": chalk.yellow,
  EXHAUSTED: chalk.red,
  UNKNOWN: chalk.dim,
} as const;

function reportStatus(report: CapacityReport): ReportStatus {
  if (report.authenticated === false) return "NOT AUTHENTICATED";
  if (report.available === "no") return "EXHAUSTED";
  if (report.available === "unknown") return "UNKNOWN";
  const maxUsed = report.windows.reduce(
    (max, window) => Math.max(max, window.usedPercent ?? 0),
    0,
  );
  return maxUsed >= HIGH_USAGE ? "LIMITED" : "OK";
}

function statusStyle(text: string): string {
  const style = STATUS_STYLES[text.trim() as ReportStatus] ?? chalk.dim;
  return style(text);
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

function localClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function resetLabel(resetsAt: string | null | undefined, now: Date): string {
  if (!resetsAt) return "—";
  const target = new Date(resetsAt);
  if (Number.isNaN(target.getTime())) return "—";
  const remainingMs = target.getTime() - now.getTime();
  if (remainingMs <= 0) return "now";
  const minutes = Math.round(remainingMs / 60000);
  const clock = localClock(target);
  if (minutes < 60) return `in ${minutes}m · ${clock}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (minutes < 24 * 60)
    return `in ${hours}h${rest ? ` ${rest}m` : ""} · ${clock}`;
  return `${MONTHS[target.getMonth()]} ${target.getDate()} · ${clock}`;
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
  const windows = sortedWindows(report.windows);
  if (windows.length === 0) {
    return [
      [report.harness, providerLabel(report.provider), status, "—", "—", "—"],
    ];
  }
  return windows.map((window) => [
    report.harness,
    providerLabel(report.provider),
    status,
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
    ui.text(`${identity} capacity · ${STATUS_STYLES[status](status)}`);
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
  ui.text(chalk.bold(`Capacity · ${reports.length} providers`));
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
