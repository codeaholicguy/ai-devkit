import inquirer from 'inquirer';
import chalk from 'chalk';
import { ConfigManager } from '../lib/Config';
import { TemplateManager } from '../lib/TemplateManager';
import { Phase, AVAILABLE_PHASES, PHASE_DISPLAY_NAMES } from '../types';

export async function phaseCommand(phaseName?: string) {
  const configManager = new ConfigManager();
  const templateManager = new TemplateManager();

  if (!(await configManager.exists())) {
    console.log(chalk.red('Error: AI DevKit not initialized. Run `ai-devkit init` first.'));
    return;
  }

  let phase: Phase;
  
  if (phaseName && AVAILABLE_PHASES.includes(phaseName as Phase)) {
    phase = phaseName as Phase;
  } else if (phaseName) {
    console.log(chalk.red(`Error: Unknown phase "${phaseName}". Available phases: ${AVAILABLE_PHASES.join(', ')}`));
    return;
  } else {
    const config = await configManager.read();
    const availableToAdd = AVAILABLE_PHASES.filter(p => !config?.initializedPhases.includes(p));

    if (availableToAdd.length === 0) {
      console.log(chalk.yellow('All phases are already initialized.'));
      const { shouldReinitialize } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldReinitialize',
          message: 'Would you like to reinitialize a phase?',
          default: false
        }
      ]);

      if (!shouldReinitialize) {
        return;
      }
    }

    const { selectedPhase } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedPhase',
        message: 'Which phase would you like to add?',
        choices: AVAILABLE_PHASES.map(p => ({
          name: PHASE_DISPLAY_NAMES[p],
          value: p
        }))
      }
    ]);
    phase = selectedPhase;
  }

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

  if (!shouldCopy) {
    console.log(chalk.yellow(`Cancelled adding ${phase} phase.`));
    return;
  }

  const file = await templateManager.copyPhaseTemplate(phase);
  await configManager.addPhase(phase);

  console.log(chalk.green(`\n[OK] ${PHASE_DISPLAY_NAMES[phase]} created successfully!`));
  console.log(chalk.blue(`  Location: ${file}\n`));
}

