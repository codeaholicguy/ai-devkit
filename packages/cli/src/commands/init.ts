import { execFileSync } from 'child_process';
import inquirer from 'inquirer';
import { BUILTIN_SKILL_NAMES, BUILTIN_SKILL_REGISTRY } from '../constants';
import { ConfigManager } from '../lib/Config';
import { TemplateManager } from '../lib/TemplateManager';
import { EnvironmentSelector } from '../lib/EnvironmentSelector';
import { PhaseSelector } from '../lib/PhaseSelector';
import { SkillManager } from '../lib/SkillManager';
import { loadInitTemplate, InitTemplateSkill } from '../lib/InitTemplate';
import { EnvironmentCode, PHASE_DISPLAY_NAMES, Phase, DEFAULT_DOCS_DIR } from '../types';
import { isValidEnvironmentCode } from '../util/env';
import { isInteractiveTerminal } from '../util/terminal';
import { ui } from '../util/terminal-ui';

function isGitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
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
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
  } catch {
    try {
      execFileSync('git', ['init'], { stdio: 'ignore' });
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
  docsDir?: string;
  builtIn?: boolean;
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

const BUILTIN_SKILLS: InitTemplateSkill[] = BUILTIN_SKILL_NAMES.map((skill: string) => ({
  registry: BUILTIN_SKILL_REGISTRY,
  skill
}));

async function shouldInstallBuiltinSkills(options: InitOptions): Promise<boolean> {
  if (options.builtIn) {
    return true;
  }

  if (!isInteractiveTerminal()) {
    ui.info(
      `Skipping built-in skills (non-interactive environment). Pass --built-in to install them from ${BUILTIN_SKILL_REGISTRY}.`
    );
    return false;
  }

  const { installBuiltinSkills } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'installBuiltinSkills',
      message: `Install AI DevKit built-in skills from ${BUILTIN_SKILL_REGISTRY}?`,
      default: true
    }
  ]);

  return Boolean(installBuiltinSkills);
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
  for (const envCode of selectedEnvironments) {
    if (await templateManager.checkEnvironmentExists(envCode)) {
      existingEnvironments.push(envCode);
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

  let docsDir = DEFAULT_DOCS_DIR;
  if (options.docsDir?.trim()) {
    docsDir = options.docsDir.trim();
  } else if (templateConfig?.paths?.docs) {
    docsDir = templateConfig.paths.docs;
  }

  const phaseTemplateManager = new TemplateManager({ docsDir });

  ui.text('Initializing AI DevKit...', { breakline: true });

  let config = await configManager.read();
  if (!config) {
    config = await configManager.create();
    ui.success('Created configuration file');
  }

  if (docsDir !== DEFAULT_DOCS_DIR) {
    await configManager.update({ paths: { docs: docsDir } });
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
  const envFiles = await phaseTemplateManager.setupMultipleEnvironments(selectedEnvironments);
  envFiles.forEach(file => {
    ui.success(`Created ${file}`);
  });

  for (const phase of selectedPhases) {
    const exists = await phaseTemplateManager.fileExists(phase);
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
      await phaseTemplateManager.copyPhaseTemplate(phase);
      await configManager.addPhase(phase);
      ui.success(`Created ${phase} phase`);
    } else {
      ui.warning(`Skipped ${phase} phase`);
    }
  }

  if (templateConfig?.registries) {
    const registryCount = Object.keys(templateConfig.registries).length;
    if (registryCount > 0) {
      await configManager.update({ registries: templateConfig.registries });
      ui.success(`Saved ${registryCount} custom registry(ies) to config.`);
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
  } else if (!hasTemplate) {
    const shouldInstall = await shouldInstallBuiltinSkills(options);

    if (shouldInstall) {
      ui.text('Installing AI DevKit built-in skills...', { breakline: true });
      const skillResults = await installTemplateSkills(skillManager, BUILTIN_SKILLS);
      const installedCount = skillResults.filter(result => result.status === 'installed').length;
      const failedResults = skillResults.filter(result => result.status === 'failed');

      if (installedCount > 0) {
        ui.success(`Installed ${installedCount} built-in skill(s).`);
      }
      if (failedResults.length > 0) {
        ui.warning(
          `${failedResults.length} built-in skill install(s) failed. Continuing with warnings.`
        );
        failedResults.forEach(result => {
          ui.warning(`${result.registry}/${result.skill}: ${result.reason || 'Unknown error'}`);
        });
      }
    }
  }

  if (templateConfig?.mcpServers && Object.keys(templateConfig.mcpServers).length > 0) {
    await configManager.update({ mcpServers: templateConfig.mcpServers });
    ui.success(`Saved ${Object.keys(templateConfig.mcpServers).length} MCP server definition(s) to config.`);
    ui.info('Run `ai-devkit install` to generate agent-specific MCP config files.');
  }

  ui.text('AI DevKit initialized successfully!', { breakline: true });
  ui.info('Next steps:');
  ui.text(`  • Review and customize templates in ${docsDir}/`);
  ui.text('  • Your AI environments are ready to use with the generated configurations');
  ui.text('  • Run `ai-devkit phase <name>` to add more phases later');
  ui.text('  • Run `ai-devkit init` again to add more environments\n');
}
