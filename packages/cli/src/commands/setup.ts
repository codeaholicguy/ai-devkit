import type { Command } from 'commander';
import {
  createSetupService,
  SUPPORTED_SETUP_AGENTS,
  type SetupAgent,
  type SetupStepStatus,
} from '../services/setup/setup.service.js';
import { ui } from '../util/terminal-ui.js';
import { inspectTmux, resolveTmuxInstallInstructions } from '../util/tmux.js';
import { createTmuxInspectionDeps } from '../util/tmux-deps.js';

interface SetupCommandOptions {
  agent?: string;
}

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('Set up AI DevKit integrations for detected local agents')
    .option('--agent <agents>', 'Comma-separated agents to set up (codex|pi)')
    .action(setupCommand);
}

export async function setupCommand(options: SetupCommandOptions = {}): Promise<void> {
  const agents = parseAgents(options.agent);

  if (agents === null) {
    process.exitCode = 1;
    return;
  }

  const tmuxDeps = createTmuxInspectionDeps();
  const tmux = await inspectTmux(tmuxDeps);

  const report = await createSetupService().run({ agents });
  const counts = countStatuses(report.results.map(result => result.status));

  ui.summary({
    title: 'Setup Summary',
    items: [
      { type: 'success', count: counts.installed, label: 'step(s) installed' },
      { type: 'warning', count: counts.skipped, label: 'step(s) skipped' },
      { type: 'error', count: counts.failed, label: 'step(s) failed' },
    ],
  });

  ui.table({
    headers: ['agent', 'step', 'status', 'message'],
    rows: report.results.map(result => [
      result.agent,
      result.step,
      result.status,
      result.message,
    ]),
  });

  if (tmux.state === 'available') {
    ui.text('Host Prerequisites');
    ui.success(tmux.version ? `tmux ${tmux.version} available` : `${tmux.rawVersion} available`);
  } else if (tmux.state === 'missing') {
    const instructions = await resolveTmuxInstallInstructions(tmuxDeps);
    ui.text('Next steps');
    ui.warning(`Next step: install tmux (${instructions.command}), then run ai-devkit setup again to start managed agents.`);
  } else {
    ui.text('Next steps');
    ui.warning(`tmux check could not run (${tmux.rawVersion}) — verify tmux works before starting agents.`);
  }

  process.exitCode = counts.failed > 0 ? 1 : 0;
}

function parseAgents(value: string | undefined): SetupAgent[] | undefined | null {
  if (!value?.trim()) {
    return undefined;
  }

  const agents = value
    .split(',')
    .map(agent => agent.trim())
    .filter(Boolean);

  const unsupportedAgent = agents.find(agent => !isSetupAgent(agent));

  if (unsupportedAgent) {
    ui.error(`Unsupported setup agent: ${unsupportedAgent}. Supported agents: ${SUPPORTED_SETUP_AGENTS.join(', ')}.`);
    return null;
  }

  return agents as SetupAgent[];
}

function isSetupAgent(agent: string): agent is SetupAgent {
  return SUPPORTED_SETUP_AGENTS.includes(agent as SetupAgent);
}

function countStatuses(statuses: SetupStepStatus[]): Record<SetupStepStatus, number> {
  return statuses.reduce<Record<SetupStepStatus, number>>((counts, status) => {
    counts[status] += 1;
    return counts;
  }, {
    installed: 0,
    skipped: 0,
    failed: 0,
  });
}
