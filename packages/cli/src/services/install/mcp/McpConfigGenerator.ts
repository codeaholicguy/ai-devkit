import inquirer from 'inquirer';
import { EnvironmentCode, McpServerDefinition } from '../../../types';
import { hasMcpSupport } from '../../../util/env';
import { isInteractiveTerminal } from '../../../util/terminal';
import { McpAgentGenerator, McpInstallReport, McpMergePlan } from './types';
import { ClaudeCodeMcpGenerator } from './ClaudeCodeMcpGenerator';
import { CodexMcpGenerator } from './CodexMcpGenerator';

export interface McpInstallOptions {
  overwrite?: boolean;
}

const GENERATORS: McpAgentGenerator[] = [
  new ClaudeCodeMcpGenerator(),
  new CodexMcpGenerator(),
];

export async function installMcpServers(
  servers: Record<string, McpServerDefinition>,
  environments: EnvironmentCode[],
  projectRoot: string,
  options: McpInstallOptions = {}
): Promise<McpInstallReport> {
  const report: McpInstallReport = {
    installed: 0,
    skipped: 0,
    conflicts: 0,
    failed: 0,
  };

  if (!servers || Object.keys(servers).length === 0) {
    return report;
  }

  const activeGenerators = GENERATORS.filter(g =>
    environments.includes(g.agentType) && hasMcpSupport(g.agentType)
  );

  for (const generator of activeGenerators) {
    try {
      const plan = await generator.plan(servers, projectRoot);

      report.skipped += plan.skippedServers.length;

      if (plan.conflictServers.length > 0) {
        const resolved = resolveConflicts(plan, options);
        plan.resolvedConflicts = typeof resolved === 'string'
          ? (resolved === 'overwrite' ? [...plan.conflictServers] : [])
          : await resolved;
        report.conflicts += plan.conflictServers.length - plan.resolvedConflicts.length;
      }

      const toInstall = plan.newServers.length + plan.resolvedConflicts.length;
      if (toInstall > 0) {
        await generator.apply(plan, servers, projectRoot);
        report.installed += toInstall;
      }
    } catch {
      report.failed += Object.keys(servers).length;
    }
  }

  return report;
}

/**
 * Non-interactive: --overwrite → overwrite all, default → skip all.
 * Interactive: prompt the user.
 */
function resolveConflicts(
  plan: McpMergePlan,
  options: McpInstallOptions
): string | Promise<string[]> {
  if (options.overwrite) return 'overwrite';
  if (!isInteractiveTerminal()) return 'skip';
  return promptConflicts(plan);
}

async function promptConflicts(plan: McpMergePlan): Promise<string[]> {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: `MCP config for ${plan.agentType}: ${plan.conflictServers.length} server(s) already exist with different config (${plan.conflictServers.join(', ')}). What would you like to do?`,
      choices: [
        { name: 'Skip all conflicts', value: 'skip' },
        { name: 'Overwrite all conflicts', value: 'overwrite' },
        { name: 'Choose per server', value: 'choose' },
      ],
    },
  ]);

  if (action === 'skip') return [];
  if (action === 'overwrite') return [...plan.conflictServers];

  // Per-server choice
  const resolved: string[] = [];
  for (const name of plan.conflictServers) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `  Overwrite "${name}" in ${plan.agentType} config?`,
        default: false,
      },
    ]);
    if (overwrite) {
      resolved.push(name);
    }
  }

  return resolved;
}
