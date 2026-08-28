import {
  getInstallExitCode,
  reconcileAndInstall
} from '../services/install/install.service.js';
import { loadConfigFile } from '../services/config/config.service.js';
import { validateInstallConfig } from '../util/config.js';
import { ui } from '../util/terminal-ui.js';
import { renderApplicationReport } from '../services/install/install-report.js';

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
    && Object.keys(validatedConfig.mcpServers).length === 0
  ) {
    ui.warning(`No installable entries found in ${loadedConfig.configPath}.`);
    ui.info('Expected one or more of: environments, phases, skills, mcpServers.');
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

  renderApplicationReport(report);

  process.exitCode = getInstallExitCode(report, {
    overwrite: options.overwrite
  });
}
