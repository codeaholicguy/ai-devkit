import { ui } from '../util/terminal-ui';
import { LintCheckResult, LintOptions, LintReport, runLintChecks } from '../services/lint/lint.service';

export async function lintCommand(options: LintOptions): Promise<void> {
  const report = runLintChecks(options);
  renderLintReport(report, options);
  process.exitCode = report.exitCode;
}

export function renderLintReport(report: LintReport, options: LintOptions = {}): void {
  if (options.json) {
    ui.text(JSON.stringify(report, null, 2));
    return;
  }

  printCategory('base-docs', report);

  if (report.feature) {
    ui.text('');
    ui.text(`=== Feature: ${report.feature.normalizedName} ===`);
    printRows(report.checks.filter(check => check.category === 'feature-docs'));

    ui.text('');
    ui.text(`=== Git: ${report.feature.branchName} ===`);
    printRows(report.checks.filter(check => check.category === 'git-worktree'));
  }

  ui.text('');
  if (report.pass) {
    ui.text('All checks passed.');
  } else {
    ui.text(`${report.summary.requiredFailures} required check(s) failed.`);
  }

  if (report.summary.warn > 0) {
    ui.text(`${report.summary.warn} warning(s) reported.`);
  }
}

function printCategory(category: LintCheckResult['category'], report: LintReport): void {
  if (category === 'base-docs') {
    ui.text('=== Base Structure ===');
  }

  printRows(report.checks.filter(check => check.category === category));
}

function printRows(checks: LintCheckResult[]): void {
  for (const check of checks) {
    const status =
      check.level === 'ok' ? '[OK]   '
        : check.level === 'warn' ? '[WARN] '
          : '[MISS] ';

    ui.text(`${status} ${check.message}`);
    if (check.fix) {
      ui.text(`       ${check.fix}`);
    }
  }
}
