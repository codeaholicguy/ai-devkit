import inquirer from 'inquirer';
import { ConfigManager } from '../../lib/Config';
import { EnvironmentSelector } from '../../lib/EnvironmentSelector';
import { SkillManager } from '../../lib/SkillManager';
import { TemplateManager } from '../../lib/TemplateManager';
import { InstallConfigData } from '../../util/config';

export interface InstallRunOptions {
  overwrite?: boolean;
}

interface InstallSectionReport {
  installed: number;
  skipped: number;
  failed: number;
}

export interface InstallReport {
  environments: InstallSectionReport;
  phases: InstallSectionReport;
  skills: InstallSectionReport;
  warnings: string[];
}

export async function reconcileAndInstall(
  config: InstallConfigData,
  options: InstallRunOptions = {}
): Promise<InstallReport> {
  const configManager = new ConfigManager();
  const templateManager = new TemplateManager();
  const skillManager = new SkillManager(configManager, new EnvironmentSelector());

  const report: InstallReport = {
    environments: { installed: 0, skipped: 0, failed: 0 },
    phases: { installed: 0, skipped: 0, failed: 0 },
    skills: { installed: 0, skipped: 0, failed: 0 },
    warnings: []
  };

  const hasConflicts = await hasOverwriteConflicts(templateManager, config);
  const shouldOverwrite = await resolveOverwritePolicy(options, hasConflicts);

  let projectConfig = await configManager.read();
  if (!projectConfig) {
    await configManager.create();
    projectConfig = await configManager.read();
  }

  if (!projectConfig) {
    throw new Error('Failed to initialize project config for install command.');
  }

  const successfulEnvironments: typeof config.environments = [];
  const successfulPhases: typeof config.phases = [];
  const successfulSkills: typeof config.skills = [];

  for (const envCode of config.environments) {
    try {
      const exists = await templateManager.checkEnvironmentExists(envCode);
      if (exists && !shouldOverwrite) {
        report.environments.skipped += 1;
        continue;
      }

      await templateManager.setupMultipleEnvironments([envCode]);
      report.environments.installed += 1;
      successfulEnvironments.push(envCode);
    } catch (error) {
      report.environments.failed += 1;
      report.warnings.push(
        `Environment ${envCode} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  for (const phase of config.phases) {
    try {
      const exists = await templateManager.fileExists(phase);
      if (exists && !shouldOverwrite) {
        report.phases.skipped += 1;
        continue;
      }

      await templateManager.copyPhaseTemplate(phase);
      await configManager.addPhase(phase);
      report.phases.installed += 1;
      successfulPhases.push(phase);
    } catch (error) {
      report.phases.failed += 1;
      report.warnings.push(
        `Phase ${phase} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  for (const skill of config.skills) {
    try {
      await skillManager.addSkill(skill.registry, skill.name);
      report.skills.installed += 1;
      successfulSkills.push(skill);
    } catch (error) {
      report.skills.failed += 1;
      report.warnings.push(
        `Skill ${skill.registry}/${skill.name} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  await configManager.update({
    environments: successfulEnvironments,
    phases: successfulPhases,
    skills: successfulSkills
  });

  return report;
}

export function getInstallExitCode(report: InstallReport, options: InstallRunOptions = {}): number {
  void options;

  const requiredFailures = report.environments.failed + report.phases.failed;
  if (requiredFailures > 0) {
    return 1;
  }

  return 0;
}

async function hasOverwriteConflicts(
  templateManager: TemplateManager,
  config: InstallConfigData
): Promise<boolean> {
  for (const env of config.environments) {
    if (await templateManager.checkEnvironmentExists(env)) {
      return true;
    }
  }

  for (const phase of config.phases) {
    if (await templateManager.fileExists(phase)) {
      return true;
    }
  }

  return false;
}

async function resolveOverwritePolicy(
  options: InstallRunOptions,
  hasConflicts: boolean
): Promise<boolean> {
  if (!hasConflicts) {
    return false;
  }

  if (options.overwrite) {
    return true;
  }

  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'overwrite',
      message: 'Existing install artifacts were found. Overwrite them?',
      default: false
    }
  ]);

  return Boolean(answer.overwrite);
}
