import inquirer from 'inquirer';
import { EnvironmentCode } from '../types';
import { getAllEnvironments, getEnvironmentsByCodes, getEnvironmentDisplayName, getGlobalCapableEnvironments } from '../util/env';

export class EnvironmentSelector {
  async selectEnvironments(): Promise<EnvironmentCode[]> {
    const environments = getAllEnvironments();

    const choices = environments.map(env => ({
      name: env.name,
      value: env.code as EnvironmentCode,
      short: env.name
    }));

    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'environments',
        message: 'Select AI environments to set up (use space to select, enter to confirm):',
        choices,
        pageSize: 10,
        validate: (input: EnvironmentCode[]) => {
          if (input.length === 0) {
            return 'Please select at least one environment.';
          }
          return true;
        }
      }
    ]);

    return answers.environments;
  }

  async confirmOverride(conflicts: EnvironmentCode[]): Promise<boolean> {
    if (conflicts.length === 0) {
      return true;
    }

    const conflictNames = conflicts.map(id => getEnvironmentDisplayName(id));

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: `The following environments are already set up and will be overwritten:\n  ${conflictNames.join(', ')}\n\nDo you want to continue?`,
        default: false
      }
    ]);

    return answers.proceed;
  }

  displaySelectionSummary(selected: EnvironmentCode[]): void {
    if (selected.length === 0) {
      console.log('No environments selected.');
      return;
    }

    console.log('\nSelected environments:');
    selected.forEach(envId => {
      console.log(`  ${getEnvironmentDisplayName(envId)}`);
    });
    console.log('');
  }

  async selectGlobalEnvironments(): Promise<EnvironmentCode[]> {
    const globalCapableEnvs = getGlobalCapableEnvironments();

    if (globalCapableEnvs.length === 0) {
      console.log('No environments support global setup.');
      return [];
    }

    const choices = globalCapableEnvs.map(env => ({
      name: env.name,
      value: env.code as EnvironmentCode,
      short: env.name
    }));

    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'environments',
        message: 'Select AI environments for global setup (use space to select, enter to confirm):',
        choices,
        pageSize: 10,
        validate: (input: EnvironmentCode[]) => {
          if (input.length === 0) {
            return 'Please select at least one environment.';
          }
          return true;
        }
      }
    ]);

    return answers.environments;
  }
}
