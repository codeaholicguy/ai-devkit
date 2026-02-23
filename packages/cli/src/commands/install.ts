import {
  getInstallExitCode,
  reconcileAndInstall
} from '../services/install/install.service';
import { loadConfigFile } from '../services/config/config.service';
import { validateInstallConfig } from '../util/config';
import { ui } from '../util/terminal-ui';

interface InstallCommandOptions {
  config?: string;
  overwrite?: boolean;
}

export async function installCommand(options: InstallCommandOptions): Promise<void> {
  const configPath = options.config?.trim() || '.ai-devkit.json';

  let loadedConfig;
  try {
    loadedConfig = await loadConfigFile(configPath);
  } catch (error) {
    ui.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  let validatedConfig;
  try {
    validatedConfig = validateInstallConfig(loadedConfig.data, loadedConfig.configPath);
  } catch (error) {
    ui.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  if (
    validatedConfig.environments.length === 0
    && validatedConfig.phases.length === 0
    && validatedConfig.skills.length === 0
  ) {
    ui.warning(`No installable entries found in ${loadedConfig.configPath}.`);
    ui.info('Expected one or more of: environments, phases, skills.');
    process.exitCode = 1;
    return;
  }

  let report;
  try {
    report = await reconcileAndInstall(validatedConfig, {
      overwrite: options.overwrite
    });
  } catch (error) {
    ui.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  ui.summary({
    title: 'Install Summary',
    items: [
      { type: 'success', count: report.environments.installed, label: 'environment(s) installed' },
      { type: 'warning', count: report.environments.skipped, label: 'environment(s) skipped' },
      { type: 'error', count: report.environments.failed, label: 'environment(s) failed' },
      { type: 'success', count: report.phases.installed, label: 'phase template(s) installed' },
      { type: 'warning', count: report.phases.skipped, label: 'phase template(s) skipped' },
      { type: 'error', count: report.phases.failed, label: 'phase template(s) failed' },
      { type: 'success', count: report.skills.installed, label: 'skill(s) installed' },
      { type: 'error', count: report.skills.failed, label: 'skill(s) failed' }
    ]
  });

  if (report.warnings.length > 0) {
    ui.text('');
    ui.warning('Warnings:');
    report.warnings.forEach(warning => {
      ui.text(`  - ${warning}`);
    });

    if (report.skills.failed > 0) {
      ui.warning('Skill failures are reported as warnings and do not change exit code.');
    }
  }

  process.exitCode = getInstallExitCode(report, {
    overwrite: options.overwrite
  });
}
