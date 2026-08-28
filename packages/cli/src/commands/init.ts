import { execFileSync } from 'child_process';
import { BUILTIN_SKILL_NAMES, BUILTIN_SKILL_REGISTRY } from '../constants.js';
import { ConfigManager } from '../lib/Config.js';
import { TemplateManager } from '../lib/TemplateManager.js';
import { EnvironmentSelector } from '../lib/EnvironmentSelector.js';
import { PhaseSelector } from '../lib/PhaseSelector.js';
import { loadInitTemplate, InitTemplateSkill } from '../lib/InitTemplate.js';
import { ConfigSkill, EnvironmentCode, Phase, DEFAULT_DOCS_DIR } from '../types.js';
import { getInstallExitCode, reconcileAndInstall } from '../services/install/install.service.js';
import { renderApplicationReport } from '../services/install/install-report.js';
import { isValidEnvironmentCode } from '../util/env.js';
import { isInteractiveTerminal } from '../util/terminal.js';
import { ui } from '../util/terminal-ui.js';
import { confirm } from '@inquirer/prompts';

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
  yes?: boolean;
  overwrite?: boolean;
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

  if (options.yes || !isInteractiveTerminal()) {
    ui.info(
      `Skipping built-in skills (non-interactive environment). Pass --built-in to install them from ${BUILTIN_SKILL_REGISTRY}.`
    );
    return false;
  }

  const installBuiltinSkills = await confirm({
    message: `Install AI DevKit built-in skills from ${BUILTIN_SKILL_REGISTRY}?`,
    default: true
  });

  return Boolean(installBuiltinSkills);
}

function normalizeSkills(skills: InitTemplateSkill[]): ConfigSkill[] {
  const seen = new Set<string>();
  const results: ConfigSkill[] = [];

  for (const entry of skills) {
    const dedupeKey = `${entry.registry}::${entry.skill}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    results.push({ registry: entry.registry, name: entry.skill });
  }

  return results;
}

export async function initCommand(options: InitOptions) {
  const configManager = new ConfigManager();
  const templateManager = new TemplateManager();
  const environmentSelector = new EnvironmentSelector();
  const phaseSelector = new PhaseSelector();
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

  const nonInteractive = Boolean(options.yes);

  if (await configManager.exists() && !hasTemplate) {
    if (nonInteractive) {
      ui.warning('AI DevKit is already initialized. Reconfiguring (--yes).');
    } else {
      const shouldContinue = await confirm({
        message: 'AI DevKit is already initialized. Do you want to reconfigure?',
        default: false
      });

      if (!shouldContinue) {
        ui.warning('Initialization cancelled.');
        return;
      }
    }
  } else if (await configManager.exists() && hasTemplate) {
    ui.warning('AI DevKit is already initialized. Reconfiguring from template.');
  }

  let selectedEnvironments: EnvironmentCode[] = normalizeEnvironmentOption(options.environment);
  if (selectedEnvironments.length === 0 && templateConfig?.environments?.length) {
    selectedEnvironments = templateConfig.environments;
  }
  if (selectedEnvironments.length === 0) {
    if (nonInteractive) {
      ui.error('Non-interactive mode requires --environment <env> (or a template that declares environments).');
      process.exitCode = 1;
      return;
    }
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
    } else if (nonInteractive) {
      if (options.overwrite) {
        ui.warning('Overwriting existing environments (--yes --overwrite).');
      } else {
        ui.warning('Skipping overwrite of existing environments (--yes without --overwrite).');
        shouldProceedWithSetup = false;
      }
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
  } else if (nonInteractive) {
    ui.error('Non-interactive mode requires --all or --phases (or a template that declares phases).');
    process.exitCode = 1;
    return;
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

  ui.text('Initializing AI DevKit...', { breakline: true });

  let config = await configManager.read();
  if (!config) {
    config = await configManager.create();
    ui.success('Created configuration file');
  }

  const desiredSkillEntries = [...(templateConfig?.skills || [])];
  if (options.builtIn || !hasTemplate) {
    const shouldInstall = await shouldInstallBuiltinSkills(options);
    if (shouldInstall) {
      desiredSkillEntries.push(...BUILTIN_SKILLS);
    }
  }
  const desiredSkills = normalizeSkills(desiredSkillEntries);

  const registries = templateConfig?.registries || config.registries || {};
  const mcpServers = templateConfig?.mcpServers || config.mcpServers || {};
  await configManager.update({
    environments: selectedEnvironments,
    phases: selectedPhases,
    ...(docsDir !== DEFAULT_DOCS_DIR ? { paths: { ...config.paths, docs: docsDir } } : {}),
    ...(Object.keys(registries).length > 0 ? { registries } : {}),
    ...(desiredSkills.length > 0 ? { skills: desiredSkills } : {}),
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {})
  });

  ui.success('Saved project configuration');
  environmentSelector.displaySelectionSummary(selectedEnvironments);
  phaseSelector.displaySelectionSummary(selectedPhases);

  const report = await reconcileAndInstall({
    environments: selectedEnvironments,
    phases: selectedPhases,
    registries,
    skills: desiredSkills,
    mcpServers
  }, {
    overwrite: options.overwrite,
    nonInteractive
  });

  renderApplicationReport(report, 'Initialization Summary');
  process.exitCode = getInstallExitCode(report, { overwrite: options.overwrite });

  if (process.exitCode !== 0) {
    ui.warning('Project configuration was saved, but setup is incomplete.');
    ui.info('Resolve the errors above, then run `ai-devkit install`.');
    return;
  }

  ui.text('AI DevKit project initialized successfully!', { breakline: true });
  ui.info('Next steps:');
  ui.text(`  • Review and customize templates in ${docsDir}/`);
  ui.text('  • Your selected AI environments are ready in this project');
  ui.text('  • Run `ai-devkit phase <name>` to add more phases later');
  ui.text('  • Run `ai-devkit init` again to add more environments\n');
}
