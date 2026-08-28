import { EnvironmentCode, McpServerDefinition } from '../../../types.js';
import { getMcpConfigPath, hasMcpSupport } from '../../../util/env.js';
import { isInteractiveTerminal } from '../../../util/terminal.js';
import { McpAgentGenerator, McpInstallReport, McpMergePlan } from './types.js';
import { ClaudeCodeMcpGenerator } from './ClaudeCodeMcpGenerator.js';
import { CodexMcpGenerator } from './CodexMcpGenerator.js';
import { JunieMcpGenerator } from './JunieMcpGenerator.js';
import { GitHubCopilotMcpGenerator } from './GitHubCopilotMcpGenerator.js';
import { DevinMcpGenerator } from './DevinMcpGenerator.js';
import { RooCodeMcpGenerator } from './RooCodeMcpGenerator.js';
import { KiloCodeMcpGenerator } from './KiloCodeMcpGenerator.js';
import { OpenCodeMcpGenerator } from './OpenCodeMcpGenerator.js';
import { confirm, select } from '@inquirer/prompts';

export interface McpInstallOptions {
  overwrite?: boolean;
  nonInteractive?: boolean;
}

const GENERATORS: McpAgentGenerator[] = [
  new ClaudeCodeMcpGenerator(),
  new CodexMcpGenerator(),
  new JunieMcpGenerator(),
  new GitHubCopilotMcpGenerator(),
  new DevinMcpGenerator(),
  new RooCodeMcpGenerator(),
  new KiloCodeMcpGenerator(),
  new OpenCodeMcpGenerator(),
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
    items: [],
  };

  if (!servers || Object.keys(servers).length === 0) {
    return report;
  }

  const selectedGenerators = GENERATORS.filter(g =>
    environments.includes(g.agentType) && hasMcpSupport(g.agentType)
  );
  const generatorsByTarget = new Map<string, McpAgentGenerator>();
  for (const generator of selectedGenerators) {
    const target = getMcpConfigPath(generator.agentType) || generator.agentType;
    if (!generatorsByTarget.has(target)) {
      generatorsByTarget.set(target, generator);
    }
  }
  const activeGenerators = [...generatorsByTarget.values()];

  for (const generator of activeGenerators) {
    const target = getMcpConfigPath(generator.agentType) || generator.agentType;
    try {
      const plan = await generator.plan(servers, projectRoot);

      report.skipped += plan.skippedServers.length;
      report.items.push(...plan.skippedServers.map(name => ({
        name, target, status: 'matched' as const
      })));

      if (plan.conflictServers.length > 0) {
        const resolved = resolveConflicts(plan, options);
        plan.resolvedConflicts = typeof resolved === 'string'
          ? (resolved === 'overwrite' ? [...plan.conflictServers] : [])
          : await resolved;
        report.conflicts += plan.conflictServers.length - plan.resolvedConflicts.length;
        const unresolved = plan.conflictServers.filter(name => !plan.resolvedConflicts.includes(name));
        report.items.push(...unresolved.map(name => ({
          name, target, status: 'conflict' as const
        })));
      }

      const toInstall = plan.newServers.length + plan.resolvedConflicts.length;
      if (toInstall > 0) {
        await generator.apply(plan, servers, projectRoot);
        report.installed += toInstall;
        report.items.push(...[...plan.newServers, ...plan.resolvedConflicts].map(name => ({
          name, target, status: 'installed' as const
        })));
      }
    } catch (error) {
      report.failed += Object.keys(servers).length;
      report.items.push(...Object.keys(servers).map(name => ({
        name,
        target,
        status: 'failed' as const,
        message: error instanceof Error ? error.message : String(error)
      })));
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
  if (options.nonInteractive || !isInteractiveTerminal()) return 'skip';
  return promptConflicts(plan);
}

async function promptConflicts(plan: McpMergePlan): Promise<string[]> {
  const action = await select({
    message: `MCP config for ${plan.agentType}: ${plan.conflictServers.length} server(s) already exist with different config (${plan.conflictServers.join(', ')}). What would you like to do?`,
    choices: [
      { name: 'Skip all conflicts', value: 'skip' },
      { name: 'Overwrite all conflicts', value: 'overwrite' },
      { name: 'Choose per server', value: 'choose' },
    ],
  });

  if (action === 'skip') return [];
  if (action === 'overwrite') return [...plan.conflictServers];

  // Per-server choice
  const resolved: string[] = [];
  for (const name of plan.conflictServers) {
    const overwrite = await confirm({
      message: `  Overwrite "${name}" in ${plan.agentType} config?`,
      default: false,
    });
    if (overwrite) {
      resolved.push(name);
    }
  }

  return resolved;
}
