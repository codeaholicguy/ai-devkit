import { ui } from '../../util/terminal-ui.js';
import type { CapacityReport, CapacityWindow } from '@ai-devkit/agent-manager';

function authLabel(value: boolean | null): string {
  return value === true ? 'yes' : value === false ? 'no' : 'unknown';
}

function formatWindow(window: CapacityWindow | undefined): string {
  if (!window || window.remainingPercent === null) return 'unknown';
  const reset = window.resetsAt ? ` · resets ${window.resetsAt}` : '';
  return `${window.remainingPercent}% left${reset}`;
}

function windowPair(windows: CapacityWindow[]): [CapacityWindow | undefined, CapacityWindow | undefined] {
  const known = windows.slice().sort((left, right) =>
    (left.durationMinutes ?? Number.MAX_SAFE_INTEGER) - (right.durationMinutes ?? Number.MAX_SAFE_INTEGER)
  );
  return [known[0], known.length > 1 ? known[known.length - 1] : undefined];
}

export function renderCapacityReport(report: CapacityReport, options: { json?: boolean } = {}): void {
  if (options.json) {
    ui.text(JSON.stringify(report, null, 2));
    return;
  }
  const rows = report.providers.map(provider => {
    const [shortWindow, longWindow] = windowPair(provider.windows);
    return [
      provider.provider,
      authLabel(provider.authenticated),
      provider.available,
      formatWindow(shortWindow),
      formatWindow(longWindow),
      provider.resetCredits?.available === null || provider.resetCredits?.available === undefined
        ? '—' : String(provider.resetCredits.available)
    ];
  });
  const headers = ['Provider', 'Auth', 'Available', 'Short window', 'Long window', 'Reset credits'];
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map(row => row[index].length)));
  const line = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd();
  ui.text(line(headers));
  ui.text(line(widths.map(width => '─'.repeat(width))));
  for (const row of rows) ui.text(line(row));
  const warnings = report.providers.flatMap(provider => provider.warnings.map(warning =>
    `${provider.provider}: ${warning.message}`
  ));
  if (warnings.length > 0) {
    ui.text('');
    ui.text('Warnings:');
    for (const warning of warnings) ui.text(`  ${warning}`);
  }
}
