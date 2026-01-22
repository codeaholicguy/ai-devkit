import { execSync } from 'child_process';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { ConfigManager } from '../lib/Config';
import { TemplateManager } from '../lib/TemplateManager';
import { EnvironmentSelector } from '../lib/EnvironmentSelector';
import { PhaseSelector } from '../lib/PhaseSelector';
import { EnvironmentCode, Phase, AVAILABLE_PHASES, PHASE_DISPLAY_NAMES } from '../types';
import { isValidEnvironmentCode } from '../util/env.js';

function isGitAvailable(): boolean {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ensureGitRepository(): void {
  if (!isGitAvailable()) {
    console.log(
      chalk.yellow(
        'Warning: Git is not installed or not available on the PATH. Skipping repository initialization.'
      )
    );
    return;
  }

  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  } catch {
    try {
      execSync('git init', { stdio: 'ignore' });
      console.log(chalk.green('[OK] Initialized a new git repository'));
    } catch (error) {
      console.log(
        chalk.red('[ERROR] Failed to initialize git repository:'),
        error instanceof Error ? error.message : error
      );
    }
  }
}

interface InitOptions {
  environment?: EnvironmentCode[];
  all?: boolean;
  phases?: string;
}

export async function initCommand(options: InitOptions) {
  const configManager = new ConfigManager();
  const templateManager = new TemplateManager();
  const environmentSelector = new EnvironmentSelector();
  const phaseSelector = new PhaseSelector();

  ensureGitRepository();

  if (await configManager.exists()) {
    const { shouldContinue } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldContinue',
        message: 'AI DevKit is already initialized. Do you want to reconfigure?',
        default: false
      }
    ]);

    if (!shouldContinue) {
      console.log(chalk.yellow('Initialization cancelled.'));
      return;
    }
  }

  let selectedEnvironments: EnvironmentCode[] = options.environment || [];
  if (selectedEnvironments.length === 0) {
    console.log(chalk.blue('\nAI Environment Setup\n'));
    selectedEnvironments = await environmentSelector.selectEnvironments();
  }

  if (selectedEnvironments.length === 0) {
    console.log(chalk.yellow('No environments selected. Initialization cancelled.'));
    return;
  }

  for (const envCode of selectedEnvironments) {
    if (!isValidEnvironmentCode(envCode)) {
      console.log(chalk.red(`Invalid environment code: ${envCode}`));
      return;
    }
  }
  const existingEnvironments: EnvironmentCode[] = [];
  for (const envId of selectedEnvironments) {
    if (await templateManager.checkEnvironmentExists(envId)) {
      existingEnvironments.push(envId);
    }
  }

  let shouldProceedWithSetup = true;
  if (existingEnvironments.length > 0) {
    console.log(chalk.yellow(`\nWarning: The following environments are already set up: ${existingEnvironments.join(', ')}\n`));
    shouldProceedWithSetup = await environmentSelector.confirmOverride(existingEnvironments);
  }

  if (!shouldProceedWithSetup) {
    console.log(chalk.yellow('Environment setup cancelled.'));
    return;
  }

  const selectedPhases = await phaseSelector.selectPhases(options.all, options.phases);

  if (selectedPhases.length === 0) {
    console.log(chalk.yellow('No phases selected. Nothing to initialize.'));
    return;
  }

  console.log(chalk.blue('\nInitializing AI DevKit...\n'));

  let config = await configManager.read();
  if (!config) {
    config = await configManager.create();
    console.log(chalk.green('[OK] Created configuration file'));
  }

  await configManager.setEnvironments(selectedEnvironments);
  console.log(chalk.green('[OK] Updated configuration with selected environments'));

  environmentSelector.displaySelectionSummary(selectedEnvironments);

  phaseSelector.displaySelectionSummary(selectedPhases);
  console.log(chalk.blue('\nSetting up environment templates...\n'));
  const envFiles = await templateManager.setupMultipleEnvironments(selectedEnvironments);
  envFiles.forEach(file => {
    console.log(chalk.green(`[OK] Created ${file}`));
  });

  for (const phase of selectedPhases) {
    const exists = await templateManager.fileExists(phase);
    let shouldCopy = true;

    if (exists) {
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `${PHASE_DISPLAY_NAMES[phase]} already exists. Overwrite?`,
          default: false
        }
      ]);
      shouldCopy = overwrite;
    }

    if (shouldCopy) {
      const file = await templateManager.copyPhaseTemplate(phase);
      await configManager.addPhase(phase);
      console.log(chalk.green(`[OK] Created ${phase} phase`));
    } else {
      console.log(chalk.yellow(`[SKIP] Skipped ${phase} phase`));
    }
  }

  console.log(chalk.green('\nAI DevKit initialized successfully!\n'));
  console.log(chalk.blue('Next steps:'));
  console.log('  • Review and customize templates in docs/ai/');
  console.log('  • Your AI environments are ready to use with the generated configurations');
  console.log('  • Run `ai-devkit phase <name>` to add more phases later');
  console.log('  • Run `ai-devkit init` again to add more environments\n');
}

