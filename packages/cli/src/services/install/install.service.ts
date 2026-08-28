import { ConfigManager } from '../../lib/Config.js';
import { EnvironmentSelector } from '../../lib/EnvironmentSelector.js';
import { SkillManager } from '../../lib/SkillManager.js';
import { TemplateManager } from '../../lib/TemplateManager.js';
import { InstallConfigData } from '../../util/config.js';
import { installMcpServers, McpInstallReport } from './mcp/index.js';
import type { DevKitConfig } from '../../types.js';
import { PHASE_DISPLAY_NAMES } from '../../types.js';
import { isInteractiveTerminal } from '../../util/terminal.js';
import { confirm } from '@inquirer/prompts';

export interface InstallRunOptions {
  overwrite?: boolean;
  nonInteractive?: boolean;
}

interface InstallSectionReport {
  installed: number;
  skipped: number;
  failed: number;
}

export type ApplicationStatus = 'installed' | 'matched' | 'skipped' | 'conflict' | 'failed';

export interface ApplicationItemResult {
  section: 'environment' | 'phase' | 'skill' | 'mcpServer';
  name: string;
  target?: string;
  status: ApplicationStatus;
  message?: string;
}

export interface InstallReport {
  environments: InstallSectionReport;
  phases: InstallSectionReport;
  skills: InstallSectionReport;
  mcpServers: McpInstallReport;
  warnings: string[];
  items: ApplicationItemResult[];
  complete: boolean;
}

export async function reconcileAndInstall(
  config: InstallConfigData,
  options: InstallRunOptions = {}
): Promise<InstallReport> {
  const configManager = new ConfigManager();
  const docsDir = await configManager.getDocsDir();
  const templateManager = new TemplateManager({ docsDir });
  const skillManager = new SkillManager(configManager, new EnvironmentSelector());

  const report: InstallReport = {
    environments: { installed: 0, skipped: 0, failed: 0 },
    phases: { installed: 0, skipped: 0, failed: 0 },
    skills: { installed: 0, skipped: 0, failed: 0 },
    mcpServers: { installed: 0, skipped: 0, conflicts: 0, failed: 0, items: [] },
    warnings: [],
    items: [],
    complete: true
  };

  let projectConfig = await configManager.read();
  if (!projectConfig) {
    await configManager.create();
    projectConfig = await configManager.read();
  }

  if (!projectConfig) {
    throw new Error('Failed to initialize project config for install command.');
  }

  const desiredUpdates: Partial<DevKitConfig> = {};
  if (config.environments.length > 0) desiredUpdates.environments = config.environments;
  if (config.phases.length > 0) desiredUpdates.phases = config.phases;
  if (Object.keys(config.registries).length > 0) desiredUpdates.registries = config.registries;
  if (config.skills.length > 0) desiredUpdates.skills = config.skills;
  if (Object.keys(config.mcpServers).length > 0) desiredUpdates.mcpServers = config.mcpServers;
  await configManager.update(desiredUpdates);

  const successfulEnvironments: typeof config.environments = [];

  for (const envCode of config.environments) {
    try {
      const installedFiles = await templateManager.setupMultipleEnvironments([envCode]);
      const status = installedFiles.length > 0 ? 'installed' : 'matched';
      if (status === 'installed') {
        report.environments.installed += 1;
      } else {
        report.environments.skipped += 1;
      }
      successfulEnvironments.push(envCode);
      report.items.push({ section: 'environment', name: envCode, status });
    } catch (error) {
      report.environments.failed += 1;
      report.warnings.push(
        `Environment ${envCode} failed: ${error instanceof Error ? error.message : String(error)}`
      );
      report.items.push({
        section: 'environment', name: envCode, status: 'failed',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  for (const phase of config.phases) {
    try {
      if (await templateManager.fileExists(phase) && !options.overwrite) {
        const overwrite = !options.nonInteractive && isInteractiveTerminal()
          ? await confirm({
            message: `${PHASE_DISPLAY_NAMES[phase]} already exists. Overwrite?`,
            default: false
          })
          : false;
        if (!overwrite) {
          report.phases.skipped += 1;
          report.items.push({ section: 'phase', name: phase, status: 'skipped' });
          continue;
        }
      }
      await templateManager.copyPhaseTemplate(phase);
      await configManager.addPhase(phase);
      report.phases.installed += 1;
      report.items.push({ section: 'phase', name: phase, status: 'installed' });
    } catch (error) {
      report.phases.failed += 1;
      report.warnings.push(
        `Phase ${phase} failed: ${error instanceof Error ? error.message : String(error)}`
      );
      report.items.push({
        section: 'phase', name: phase, status: 'failed',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  for (const skill of config.skills) {
    try {
      const status = await skillManager.addSkill(skill.registry, skill.name);
      if (status === 'matched') {
        report.skills.skipped += 1;
      } else {
        report.skills.installed += 1;
      }
      report.items.push({
        section: 'skill',
        name: skill.name,
        status: status === 'matched' ? 'matched' : 'installed'
      });
    } catch (error) {
      report.skills.failed += 1;
      report.warnings.push(
        `Skill ${skill.registry}/${skill.name} failed: ${error instanceof Error ? error.message : String(error)}`
      );
      report.items.push({
        section: 'skill', name: skill.name, status: 'failed',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
    const allEnvironments = [
      ...new Set([...projectConfig.environments, ...successfulEnvironments])
    ];
    try {
      const mcpReport = await installMcpServers(
        config.mcpServers,
        allEnvironments,
        process.cwd(),
        { overwrite: options.overwrite, nonInteractive: options.nonInteractive }
      );
      report.mcpServers = mcpReport;
      report.items.push(...mcpReport.items.map(item => ({
        section: 'mcpServer' as const,
        ...item
      })));
    } catch (error) {
      report.warnings.push(
        `MCP servers failed: ${error instanceof Error ? error.message : String(error)}`
      );
      report.mcpServers.failed = Object.keys(config.mcpServers).length;
    }
  }

  report.complete = report.items.every(item => item.status !== 'failed' && item.status !== 'conflict')
    && report.mcpServers.failed === 0
    && report.mcpServers.conflicts === 0;

  return report;
}

export function getInstallExitCode(report: InstallReport, options: InstallRunOptions = {}): number {
  void options;
  return report.complete ? 0 : 1;
}
