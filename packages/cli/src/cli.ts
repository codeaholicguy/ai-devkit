#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { phaseCommand } from './commands/phase.js';
import { lintCommand } from './commands/lint.js';
import { installCommand } from './commands/install.js';
import { registerMemoryCommand } from './commands/memory.js';
import { registerSkillCommand } from './commands/skill.js';
import { registerAgentCommand } from './commands/agent.js';
import { registerChannelCommand } from './commands/channel.js';
import { registerDocsCommand } from './commands/docs.js';
import { registerPluginCommand } from './commands/plugin.js';
import { registerSetupCommand } from './commands/setup.js';
import { registerConfiguredPluginCommands } from './services/plugin/plugin-loader.service.js';
import { createAiDevkitRuntime } from './services/plugin/runtime.js';
import { handleCliError } from './util/errors.js';
import pkg from '../package.json' with { type: 'json' };
const { version } = pkg as { version: string };

const program = new Command();

program
  .name('ai-devkit')
  .description('AI-assisted software development toolkit')
  .version(version);

program
  .command('init')
  .description('Initialize AI DevKit in the current directory')
  .option('-e, --environment <env>', 'Development environment (cursor|claude|both)')
  .option('-a, --all', 'Initialize all phases')
  .option('-p, --phases <phases>', 'Comma-separated list of phases to initialize')
  .option('-t, --template <path>', 'Initialize from template file (.yaml, .yml, .json)')
  .option('-d, --docs-dir <path>', 'Custom directory for AI documentation (default: docs/ai)')
  .option('--built-in', 'Install AI DevKit built-in skills without prompting (useful for CI/non-interactive runs)')
  .option('-y, --yes', 'Run non-interactively. Without -t, requires -e <env> and one of -a/-p. Existing files are kept unless --overwrite is also passed.')
  .option('--overwrite', 'With --yes, overwrite existing environments and phase files instead of skipping them')
  .action(initCommand);

program
  .command('phase [name]')
  .description('Add a specific phase template (requirements|design|planning|implementation|testing|deployment|monitoring)')
  .action(phaseCommand);

program
  .command('lint')
  .description('Validate workspace readiness for AI DevKit workflows')
  .option('-f, --feature <name>', 'Validate docs and git worktree conventions for a feature')
  .option('--json', 'Output lint results as JSON')
  .action(lintCommand);

program
  .command('install')
  .description('Install AI DevKit artifacts from a project config')
  .option('-c, --config <path>', 'Path to config file (default: .ai-devkit.json)')
  .option('--overwrite', 'Overwrite existing install artifacts')
  .action(installCommand);

registerMemoryCommand(program);
registerSkillCommand(program);
registerAgentCommand(program);
registerChannelCommand(program);
registerDocsCommand(program);
registerPluginCommand(program);
registerSetupCommand(program);

await registerConfiguredPluginCommands(program, createAiDevkitRuntime());

try {
  await program.parseAsync();
} catch (error) {
  await handleCliError('run command', error);
}
