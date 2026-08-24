import chalk from 'chalk';
import { ui } from '../../util/terminal-ui.js';
import type { CheckStatus, StatusReport } from '../../services/status/status.service.js';

function statusStyle(text: string): string {
  return text === 'pass' ? chalk.green(text) : text === 'warn' ? chalk.yellow(text) : chalk.red(text);
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}

export function renderStatusReport(report: StatusReport, options: { json?: boolean } = {}): void {
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  ui.text('AI DevKit Status:', { breakline: true });
  ui.table({
    headers: ['Scope', 'Status', 'Details'],
    rows: [
      ['overall', report.overall, `${report.checks.passed} pass · ${report.checks.warnings} warn · ${report.checks.failed} fail`],
      ['ai-devkit', report.aiDevkit.status, report.aiDevkit.latestVersion
        ? `${report.aiDevkit.installedVersion} (latest ${report.aiDevkit.latestVersion})`
        : `${report.aiDevkit.installedVersion} (latest unknown)`],
      ['project', report.project.config.status, report.project.config.path],
      ['tmux', report.tmux.status, report.tmux.available ? `${report.tmux.path} · ${report.tmux.version ?? 'unknown'}` : 'unavailable'],
      ['registries', report.registries.status,
        `${Object.keys(report.registries.project.configured).length} project · ${Object.keys(report.registries.global.configured).length} global`],
      ['channels', report.channels.status, `${report.channels.readyCount}/${report.channels.connections.length} ready`],
    ],
    maxWidth: process.stdout.columns ?? 120,
    columnStyles: [chalk.cyan, statusStyle, chalk.dim],
  });

  ui.text('Agents:', { breakline: true });
  ui.table({
    headers: ['Agent', 'Status'],
    rows: (['codex', 'pi', 'claude'] as const).map(agent => [agent, report.agents[agent].status]),
    maxWidth: process.stdout.columns ?? 120,
    columnStyles: [chalk.cyan, statusStyle],
  });

  const details: Array<[string, CheckStatus, string]> = [];
  for (const agent of ['codex', 'pi', 'claude'] as const) {
    const item = report.agents[agent];
    details.push(
      [`${agent}: executable`, item.executable.status, item.executable.path ?? 'not found'],
      [`${agent}: config`, item.globalConfig.status, item.globalConfig.path],
      [`${agent}: auth`, item.auth.status, item.auth.state],
      [`${agent}: skills`, item.builtInSkills.status, `${item.builtInSkills.present}/${item.builtInSkills.required}`],
      [`${agent}: hooks`, item.hooks.status, yesNo(item.hooks.status === 'pass')],
    );
  }
  ui.table({
    headers: ['Check', 'Status', 'Evidence'], rows: details,
    maxWidth: process.stdout.columns ?? 120,
    columnStyles: [chalk.cyan, statusStyle, chalk.dim],
  });

  for (const agent of ['codex', 'pi', 'claude'] as const) {
    const missing = report.agents[agent].builtInSkills.missing;
    if (missing.length) ui.warning(`${agent} missing built-in skills: ${missing.join(', ')}`);
  }
}
