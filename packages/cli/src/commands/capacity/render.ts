import chalk from 'chalk';
import { ui } from '../../util/terminal-ui.js';
import type { CapacityReport, CapacityWindow } from '@ai-devkit/agent-manager';

function authLabel(value: boolean | null): string {
  return value === true ? 'yes' : value === false ? 'no' : 'unknown';
}

function formatWindow(window: CapacityWindow | undefined): string {
  if (!window || window.usedPercent === null) return 'unknown';
  const remaining = Math.max(0, Math.min(100, 100 - window.usedPercent));
  const reset = window.resetsAt ? ` · resets ${window.resetsAt}` : '';
  return `${remaining}% left${reset}`;
}

function windowPair(windows: CapacityWindow[]): [CapacityWindow | undefined, CapacityWindow | undefined] {
  const known = windows.slice().sort((left, right) =>
    (left.durationMinutes ?? Number.MAX_SAFE_INTEGER) - (right.durationMinutes ?? Number.MAX_SAFE_INTEGER)
  );
  return [known[0], known.length > 1 ? known[known.length - 1] : undefined];
}

export function renderCapacityReport(report: CapacityReport, options: { json?: boolean } = {}): void {
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  ui.text('Capacity:', { breakline: true });

  const [shortWindow, longWindow] = windowPair(report.windows);
  ui.table({
    headers: ['Provider', 'Auth', 'Available', 'Short window', 'Long window', 'Credits'],
    rows: [[
      report.provider,
      authLabel(report.authenticated),
      report.available,
      formatWindow(shortWindow),
      formatWindow(longWindow),
      report.creditsRemaining === null || report.creditsRemaining === undefined
        ? '—' : String(report.creditsRemaining),
    ]],
    maxWidth: process.stdout.columns ?? 120,
    columnStyles: [
      (text) => chalk.cyan(text),
      (text) => chalk.dim(text),
      (text) => (text === 'yes' ? chalk.green(text) : text === 'no' ? chalk.yellow(text) : chalk.gray(text)),
      (text) => text,
      (text) => chalk.dim(text),
      (text) => chalk.dim(text),
    ],
  });
}
