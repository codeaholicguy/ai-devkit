import inquirer from 'inquirer';
import * as path from 'path';
import { TemplateManager } from '../lib/TemplateManager';
import { EnvironmentSelector } from '../lib/EnvironmentSelector';
import { EnvironmentCode } from '../types';
import { getEnvironmentDisplayName, getEnvironment } from '../util/env';
import { ui } from '../util/terminal-ui';

interface SetupOptions {
    global?: boolean;
}

export async function setupCommand(options: SetupOptions) {
    if (!options.global) {
        ui.warning('Please use --global flag to set up global commands.');
        ui.info('Usage: ai-devkit setup --global');
        return;
    }

    await setupGlobalCommands();
}

async function setupGlobalCommands() {
    const templateManager = new TemplateManager();
    const environmentSelector = new EnvironmentSelector();

    ui.info('Global Setup\n');
    ui.info('This will copy AI DevKit commands to your global environment folders.\n');

    const selectedEnvironments = await environmentSelector.selectGlobalEnvironments();

    if (selectedEnvironments.length === 0) {
        ui.warning('No environments selected. Setup cancelled.');
        return;
    }

    environmentSelector.displaySelectionSummary(selectedEnvironments);

    for (const envCode of selectedEnvironments) {
        await processGlobalEnvironment(envCode, templateManager);
    }

    ui.success('\nGlobal setup completed successfully!\n');
    ui.info('Your commands are now available globally for the selected environments.');
}

async function processGlobalEnvironment(
    envCode: EnvironmentCode,
    templateManager: TemplateManager
): Promise<void> {
    const envName = getEnvironmentDisplayName(envCode);
    const env = getEnvironment(envCode);

    if (!env || !env.globalCommandPath) {
        ui.error(`${envName} does not support global setup.`);
        return;
    }

    ui.info(`\nSetting up ${envName}...`);
    ui.info(`  Global path: ~/${env.globalCommandPath}`);

    const commandsExist = await templateManager.checkGlobalCommandsExist(envCode);

    if (commandsExist) {
        const { shouldOverwrite } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'shouldOverwrite',
                message: `Global commands already exist for ${envName}. Overwrite?`,
                default: false
            }
        ]);

        if (!shouldOverwrite) {
            ui.warning(`Skipped ${envName} (files already exist)`);
            return;
        }
    }

    try {
        const copiedFiles = await templateManager.copyCommandsToGlobal(envCode);
        ui.success(`Copied ${copiedFiles.length} commands to ${envName} global folder`);
        copiedFiles.forEach(file => {
            const fileName = path.basename(file);
            ui.info(`     • ${fileName}`);
        });
    } catch (error) {
        if (error instanceof Error) {
            ui.error(`Failed to set up ${envName}: ${error.message}`);
        } else {
            ui.error(`Failed to set up ${envName}`);
        }
    }
}
