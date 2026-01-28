import { execSync } from 'child_process';
import inquirer from 'inquirer';
import { ConfigManager } from '../lib/Config';
import { TemplateManager } from '../lib/TemplateManager';
import { EnvironmentSelector } from '../lib/EnvironmentSelector';
import { PhaseSelector } from '../lib/PhaseSelector';
import { EnvironmentCode, PHASE_DISPLAY_NAMES } from '../types';
import { isValidEnvironmentCode } from '../util/env.js';
import { ui } from '../util/terminal-ui';

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
    ui.warning(
      'Git is not installed or not available on the PATH. Skipping repository initialization.'
    );
    return;
  }

  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  } catch {
    try {
      execSync('git init', { stdio: 'ignore' });
      ui.success('Initialized a new git repository');
    } catch (error) {
      ui.error(
        `Failed to initialize git repository: ${error instanceof Error ? error.message : error}`
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
      ui.warning('Initialization cancelled.');
      return;
    }
  }

  let selectedEnvironments: EnvironmentCode[] = options.environment || [];
  if (selectedEnvironments.length === 0) {
    ui.info('AI Environment Setup');
    selectedEnvironments = await environmentSelector.selectEnvironments();
  }

  if (selectedEnvironments.length === 0) {
    ui.warning('No environments selected. Initialization cancelled.');
    return;
  }

  for (const envCode of selectedEnvironments) {
    if (!isValidEnvironmentCode(envCode)) {
      ui.error(`Invalid environment code: ${envCode}`);
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
    ui.warning(`The following environments are already set up: ${existingEnvironments.join(', ')}`);
    shouldProceedWithSetup = await environmentSelector.confirmOverride(existingEnvironments);
  }

  if (!shouldProceedWithSetup) {
    ui.warning('Environment setup cancelled.');
    return;
  }

  const selectedPhases = await phaseSelector.selectPhases(options.all, options.phases);

  if (selectedPhases.length === 0) {
    ui.warning('No phases selected. Nothing to initialize.');
    return;
  }

  ui.text('Initializing AI DevKit...', { breakline: true });

  let config = await configManager.read();
  if (!config) {
    config = await configManager.create();
    ui.success('Created configuration file');
  }

  await configManager.setEnvironments(selectedEnvironments);
  ui.success('Updated configuration with selected environments');

  environmentSelector.displaySelectionSummary(selectedEnvironments);

  phaseSelector.displaySelectionSummary(selectedPhases);
  ui.text('Setting up environment templates...', { breakline: true });
  const envFiles = await templateManager.setupMultipleEnvironments(selectedEnvironments);
  envFiles.forEach(file => {
    ui.success(`Created ${file}`);
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
      await templateManager.copyPhaseTemplate(phase);
      await configManager.addPhase(phase);
      ui.success(`Created ${phase} phase`);
    } else {
      ui.warning(`Skipped ${phase} phase`);
    }
  }

  ui.text('AI DevKit initialized successfully!', { breakline: true });
  ui.info('Next steps:');
  ui.text('  • Review and customize templates in docs/ai/');
  ui.text('  • Your AI environments are ready to use with the generated configurations');
  ui.text('  • Run `ai-devkit phase <name>` to add more phases later');
  ui.text('  • Run `ai-devkit init` again to add more environments\n');
}

