import chalk from 'chalk';
import type { AgentReadinessReport, ReadinessAgentType } from '@ai-devkit/agent-manager';
import { ui } from '../../util/terminal-ui.js';
import type { CheckStatus, StatusReport } from '../../services/status/status.service.js';

function statusStyle(text: string): string {
  if (text === 'ready' || text === 'pass') return chalk.green(text);
  if (text === 'not ready' || text === 'warn') return chalk.yellow(text);
  if (text === 'fail') return chalk.red(text);
  return chalk.dim(text);
}

function statusLabel(status: CheckStatus | 'info'): string {
  if (status === 'pass') return 'ready';
  if (status === 'warn') return 'not ready';
  return status;
}

function installed(value: boolean): string {
  return value ? 'installed' : 'not installed';
}

function authEvidence(auth: NonNullable<AgentReadinessReport['auth']>): string {
  return auth.provider ?? auth.state;
}

function agentEntries(report: StatusReport): Array<[ReadinessAgentType, AgentReadinessReport]> {
  return (Object.entries(report.agents) as Array<[ReadinessAgentType, AgentReadinessReport]>)
    .filter(([, agent]) => agent.executable.path !== null);
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
      ['overall', statusLabel(report.overall), `${report.checks.passed} ready · ${report.checks.warnings} not ready · ${report.checks.failed} fail`],
      ['ai-devkit', statusLabel(report.aiDevkit.status), report.aiDevkit.latestVersion
        ? `${report.aiDevkit.installedVersion} (latest ${report.aiDevkit.latestVersion})`
        : `${report.aiDevkit.installedVersion} (latest unknown)`],
      ['project', statusLabel(report.project.config.status), report.project.config.path],
      ['tmux', statusLabel(report.tmux.status), report.tmux.available ? `${report.tmux.path} · ${report.tmux.version ?? 'unknown'}` : 'unavailable'],
      ['registries', 'info',
        `${Object.keys(report.registries.project.configured).length} project · ${Object.keys(report.registries.global.configured).length} global`],
      ['channels', 'info', `${report.channels.readyCount}/${report.channels.connections.length} ready`],
    ],
    maxWidth: process.stdout.columns ?? 120,
    columnStyles: [chalk.cyan, statusStyle, chalk.dim],
  });

  ui.text('Agents:', { breakline: true });
  ui.table({
    headers: ['Agent', 'Status'],
    rows: agentEntries(report).map(([agent, item]) => [agent, statusLabel(item.status)]),
    maxWidth: process.stdout.columns ?? 120,
    columnStyles: [chalk.cyan, statusStyle],
  });

  ui.text('Checks:', { breakline: true });
  const details: Array<[string, string, string]> = [];
  for (const [agent, item] of agentEntries(report)) {
    details.push(
      [`${agent}: executable`, statusLabel(item.executable.status), item.executable.path ?? 'not found'],
      [`${agent}: config`, statusLabel(item.globalConfig.status), item.globalConfig.path],
      [`${agent}: ai-devkit built-in skills`, statusLabel(item.builtInSkills.status), `${item.builtInSkills.present}/${item.builtInSkills.required}`],
    );
    if (item.auth) {
      details.push([`${agent}: auth`, statusLabel(item.auth.status), authEvidence(item.auth)]);
      if (item.auth.availableProviders.length) {
        details.push([`${agent}: providers`, 'info', item.auth.availableProviders.join(', ')]);
      }
    }
    if (item.integration) {
      details.push([`${agent}: ${item.integration.label}`, statusLabel(item.integration.status), installed(item.integration.installed)]);
    }
  }
  ui.table({
    headers: ['Check', 'Status', 'Evidence'], rows: details,
    maxWidth: process.stdout.columns ?? 120,
    columnStyles: [chalk.cyan, statusStyle, chalk.dim],
  });
}
