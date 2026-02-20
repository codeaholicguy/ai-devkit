#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { phaseCommand } from './commands/phase';
import { setupCommand } from './commands/setup';
import { lintCommand } from './commands/lint';
import { registerMemoryCommand } from './commands/memory';
import { registerSkillCommand } from './commands/skill';
import { registerAgentCommand } from './commands/agent';

const program = new Command();

program
  .name('ai-devkit')
  .description('AI-assisted software development toolkit')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize AI DevKit in the current directory')
  .option('-e, --environment <env>', 'Development environment (cursor|claude|both)')
  .option('-a, --all', 'Initialize all phases')
  .option('-p, --phases <phases>', 'Comma-separated list of phases to initialize')
  .option('-t, --template <path>', 'Initialize from template file (.yaml, .yml, .json)')
  .action(initCommand);

program
  .command('phase [name]')
  .description('Add a specific phase template (requirements|design|planning|implementation|testing|deployment|monitoring)')
  .action(phaseCommand);

program
  .command('setup')
  .description('Set up AI DevKit commands globally')
  .option('-g, --global', 'Install commands to global environment folders')
  .action(setupCommand);

program
  .command('lint')
  .description('Validate workspace readiness for AI DevKit workflows')
  .option('-f, --feature <name>', 'Validate docs and git worktree conventions for a feature')
  .option('--json', 'Output lint results as JSON')
  .action(lintCommand);

registerMemoryCommand(program);
registerSkillCommand(program);
registerAgentCommand(program);

program.parse();
