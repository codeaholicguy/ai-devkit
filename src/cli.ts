#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { phaseCommand } from './commands/phase';
import { setupCommand } from './commands/setup';

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

program.parse();
