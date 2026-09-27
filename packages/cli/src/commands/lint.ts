import chalk from "chalk";
import { ConfigManager } from "../lib/Config.js";
import { ui } from "../util/terminal-ui.js";
import { LINT_STATUS_LABEL } from "../services/lint/constants.js";
import {
  LintCheckResult,
  LintOptions,
  LintReport,
  runLintChecks,
} from "../services/lint/lint.service.js";

export async function lintCommand(options: LintOptions): Promise<void> {
  const configManager = new ConfigManager();
  const docsDir = await configManager.getDocsDir();
  const phases = await configManager.getPhases();
  const report = runLintChecks(options, docsDir, phases);
  renderLintReport(report, options);
  process.exitCode = report.exitCode;
}

export function renderLintReport(
  report: LintReport,
  options: LintOptions = {},
): void {
  if (options.json) {
    ui.text(JSON.stringify(report, null, 2));
    return;
  }

  const sections: Array<{
    title: string;
    category: LintCheckResult["category"];
  }> = [{ title: "Base Structure", category: "base-docs" }];

  if (report.feature) {
    sections.push(
      {
        title: `Feature: ${report.feature.normalizedName}`,
        category: "feature-docs",
      },
      { title: `Git: ${report.feature.branchName}`, category: "git-worktree" },
    );
  }

  sections.forEach((section, index) => {
    if (index > 0) {
      ui.text("");
    }
    printSection(section.title, section.category, report);
  });

  ui.text("");
  if (report.pass) {
    ui.text(chalk.green(`${pluralize(report.summary.ok, "check")} passed.`));
  } else {
    ui.text(
      chalk.red(
        `${pluralize(report.summary.requiredFailures, "required check")} failed.`,
      ),
    );
  }

  if (report.summary.warn > 0) {
    ui.text(
      chalk.yellow(`${pluralize(report.summary.warn, "warning")} reported.`),
    );
  }
}

function printSection(
  title: string,
  category: LintCheckResult["category"],
  report: LintReport,
): void {
  ui.text(chalk.bold(title));
  printRows(report.checks.filter((check) => check.category === category));
}

function printRows(checks: LintCheckResult[]): void {
  for (const check of checks) {
    ui.text(`${LINT_STATUS_LABEL[check.level]} ${formatCheckMessage(check)}`);
    if (check.fix) {
      ui.text(chalk.dim(`  Fix: ${check.fix}`));
    }
  }
}

function formatCheckMessage(check: LintCheckResult): string {
  if (check.level === "ok") {
    return chalk.dim(check.message);
  }

  return check.message;
}

function pluralize(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}
