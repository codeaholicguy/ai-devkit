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

  const sections: Array<{ title: string; category: LintCheckResult['category'] }> = [
    { title: '=== Base Structure ===', category: 'base-docs' }
  ];

  if (report.feature) {
    sections.push(
      { title: `=== Feature: ${report.feature.normalizedName} ===`, category: 'feature-docs' },
      { title: `=== Git: ${report.feature.branchName} ===`, category: 'git-worktree' }
    );
  }

  sections.forEach((section, index) => {
    if (index > 0) {
      ui.text('');
    }
    printSection(section.title, section.category, report);
  });

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

function printSection(title: string, category: LintCheckResult['category'], report: LintReport): void {
  ui.text(title);
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
