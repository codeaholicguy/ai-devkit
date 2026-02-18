import { execSync } from 'child_process';
import inquirer from 'inquirer';
import { ConfigManager } from '../lib/Config';
import { TemplateManager } from '../lib/TemplateManager';
import { EnvironmentSelector } from '../lib/EnvironmentSelector';
import { PhaseSelector } from '../lib/PhaseSelector';
import { SkillManager } from '../lib/SkillManager';
import { loadInitTemplate, InitTemplateSkill } from '../lib/InitTemplate';
import { EnvironmentCode, PHASE_DISPLAY_NAMES, Phase } from '../types';
import { isValidEnvironmentCode } from '../util/env';
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
  environment?: EnvironmentCode[] | string;
  all?: boolean;
  phases?: string;
  template?: string;
}

function normalizeEnvironmentOption(
  environment: EnvironmentCode[] | string | undefined
): EnvironmentCode[] {
  if (!environment) {
    return [];
  }

  if (Array.isArray(environment)) {
    return environment;
  }

  return environment
    .split(',')
    .map(value => value.trim())
    .filter((value): value is EnvironmentCode => value.length > 0);
}

interface TemplateSkillInstallResult {
  registry: string;
  skill: string;
  status: 'installed' | 'skipped' | 'failed';
  reason?: string;
}

async function installTemplateSkills(
  skillManager: SkillManager,
  skills: InitTemplateSkill[]
): Promise<TemplateSkillInstallResult[]> {
  const seen = new Set<string>();
  const results: TemplateSkillInstallResult[] = [];

  for (const entry of skills) {
    const dedupeKey = `${entry.registry}::${entry.skill}`;
    if (seen.has(dedupeKey)) {
      results.push({
        registry: entry.registry,
        skill: entry.skill,
        status: 'skipped',
        reason: 'Duplicate skill entry in template'
      });
      continue;
    }
    seen.add(dedupeKey);

    try {
      await skillManager.addSkill(entry.registry, entry.skill);
      results.push({
        registry: entry.registry,
        skill: entry.skill,
        status: 'installed'
      });
    } catch (error) {
      results.push({
        registry: entry.registry,
        skill: entry.skill,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return results;
}

export async function initCommand(options: InitOptions) {
  const configManager = new ConfigManager();
  const templateManager = new TemplateManager();
  const environmentSelector = new EnvironmentSelector();
  const phaseSelector = new PhaseSelector();
  const skillManager = new SkillManager(configManager, environmentSelector);
  const templatePath = options.template?.trim();
  const hasTemplate = Boolean(templatePath);
  const templateConfig = hasTemplate
    ? await loadInitTemplate(templatePath as string).catch(error => {
      ui.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
      return null;
    })
    : null;

  if (hasTemplate && !templateConfig) {
    return;
  }

  ensureGitRepository();

  if (await configManager.exists() && !hasTemplate) {
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
  } else if (await configManager.exists() && hasTemplate) {
    ui.warning('AI DevKit is already initialized. Reconfiguring from template.');
  }

  let selectedEnvironments: EnvironmentCode[] = normalizeEnvironmentOption(options.environment);
  if (selectedEnvironments.length === 0 && templateConfig?.environments?.length) {
    selectedEnvironments = templateConfig.environments;
  }
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
    if (hasTemplate) {
      ui.warning('Template mode enabled: proceeding with overwrite of selected environments.');
    } else {
      shouldProceedWithSetup = await environmentSelector.confirmOverride(existingEnvironments);
    }
  }

  if (!shouldProceedWithSetup) {
    ui.warning('Environment setup cancelled.');
    return;
  }

  let selectedPhases: Phase[] = [];
  if (options.all || options.phases) {
    selectedPhases = await phaseSelector.selectPhases(options.all, options.phases);
  } else if (templateConfig?.phases?.length) {
    selectedPhases = templateConfig.phases;
  } else {
    selectedPhases = await phaseSelector.selectPhases();
  }

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
  if (hasTemplate && templateConfig) {
    ui.info(`Template mode: ${templatePath}`);
    if (templateConfig.skills?.length) {
      ui.info(`Template skills to install: ${templateConfig.skills.length}`);
    }
  }
  ui.text('Setting up environment templates...', { breakline: true });
  const envFiles = await templateManager.setupMultipleEnvironments(selectedEnvironments);
  envFiles.forEach(file => {
    ui.success(`Created ${file}`);
  });

  for (const phase of selectedPhases) {
    const exists = await templateManager.fileExists(phase);
    let shouldCopy = true;

    if (exists) {
      if (hasTemplate) {
        ui.warning(`${PHASE_DISPLAY_NAMES[phase]} already exists. Overwriting in template mode.`);
      } else {
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
    }

    if (shouldCopy) {
      await templateManager.copyPhaseTemplate(phase);
      await configManager.addPhase(phase);
      ui.success(`Created ${phase} phase`);
    } else {
      ui.warning(`Skipped ${phase} phase`);
    }
  }

  if (templateConfig?.skills?.length) {
    ui.text('Installing skills from template...', { breakline: true });
    const skillResults = await installTemplateSkills(skillManager, templateConfig.skills);
    const installedCount = skillResults.filter(result => result.status === 'installed').length;
    const skippedCount = skillResults.filter(result => result.status === 'skipped').length;
    const failedResults = skillResults.filter(result => result.status === 'failed');

    if (installedCount > 0) {
      ui.success(`Installed ${installedCount} skill(s) from template.`);
    }
    if (skippedCount > 0) {
      ui.warning(`Skipped ${skippedCount} duplicate skill entry(ies) from template.`);
    }
    if (failedResults.length > 0) {
      ui.warning(
        `${failedResults.length} skill install(s) failed. Continuing with warnings as configured.`
      );
      failedResults.forEach(result => {
        ui.warning(`${result.registry}/${result.skill}: ${result.reason || 'Unknown error'}`);
      });
    }
  }

  ui.text('AI DevKit initialized successfully!', { breakline: true });
  ui.info('Next steps:');
  ui.text('  • Review and customize templates in docs/ai/');
  ui.text('  • Your AI environments are ready to use with the generated configurations');
  ui.text('  • Run `ai-devkit phase <name>` to add more phases later');
  ui.text('  • Run `ai-devkit init` again to add more environments\n');
}
