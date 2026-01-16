import inquirer from 'inquirer';
import chalk from 'chalk';
import * as path from 'path';
import { TemplateManager } from '../lib/TemplateManager';
import { EnvironmentSelector } from '../lib/EnvironmentSelector';
import { EnvironmentCode } from '../types';
import { getEnvironmentDisplayName, getEnvironment } from '../util/env';

interface SetupOptions {
    global?: boolean;
}

export async function setupCommand(options: SetupOptions) {
    if (!options.global) {
        console.log(chalk.yellow('Please use --global flag to set up global commands.'));
        console.log(chalk.blue('Usage: ai-devkit setup --global'));
        return;
    }

    await setupGlobalCommands();
}

async function setupGlobalCommands() {
    const templateManager = new TemplateManager();
    const environmentSelector = new EnvironmentSelector();

    console.log(chalk.blue('Global Setup\n'));
    console.log(chalk.gray('This will copy AI DevKit commands to your global environment folders.\n'));

    const selectedEnvironments = await environmentSelector.selectGlobalEnvironments();

    if (selectedEnvironments.length === 0) {
        console.log(chalk.yellow('No environments selected. Setup cancelled.'));
        return;
    }

    environmentSelector.displaySelectionSummary(selectedEnvironments);

    for (const envCode of selectedEnvironments) {
        await processGlobalEnvironment(envCode, templateManager);
    }

    console.log(chalk.green('\n✅ Global setup completed successfully!\n'));
    console.log(chalk.blue('Your commands are now available globally for the selected environments.'));
}

async function processGlobalEnvironment(
    envCode: EnvironmentCode,
    templateManager: TemplateManager
): Promise<void> {
    const envName = getEnvironmentDisplayName(envCode);
    const env = getEnvironment(envCode);

    if (!env || !env.globalCommandPath) {
        console.log(chalk.red(`[ERROR] ${envName} does not support global setup.`));
        return;
    }

    console.log(chalk.blue(`\nSetting up ${envName}...`));
    console.log(chalk.gray(`  Global path: ~/${env.globalCommandPath}`));

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
            console.log(chalk.yellow(`[SKIP] Skipped ${envName} (files already exist)`));
            return;
        }
    }

    try {
        const copiedFiles = await templateManager.copyCommandsToGlobal(envCode);
        console.log(chalk.green(`[OK] Copied ${copiedFiles.length} commands to ${envName} global folder`)); // Show copied files
        copiedFiles.forEach(file => {
            const fileName = path.basename(file);
            console.log(chalk.gray(`     • ${fileName}`));
        });
    } catch (error) {
        if (error instanceof Error) {
            console.log(chalk.red(`[ERROR] Failed to set up ${envName}: ${error.message}`));
        } else {
            console.log(chalk.red(`[ERROR] Failed to set up ${envName}`));
        }
    }
}
