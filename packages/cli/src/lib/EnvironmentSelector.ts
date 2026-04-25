import inquirer from "inquirer";
import { EnvironmentCode, EnvironmentDefinition } from "../types";
import {
  getAllEnvironments,
  getEnvironmentDisplayName,
  getGlobalCapableEnvironments,
  getSkillCapableEnvironments,
} from "../util/env";
import { ui } from "../util/terminal-ui";

export class EnvironmentSelector {
  private async selectFromEnvironments(
    environments: EnvironmentDefinition[],
    message: string,
    emptyMessage: string
  ): Promise<EnvironmentCode[]> {
    if (environments.length === 0) {
      ui.info(emptyMessage);
      return [];
    }

    const choices = environments.map((env) => ({
      name: env.name,
      value: env.code as EnvironmentCode,
      short: env.name,
    }));

    const answers = await inquirer.prompt([
      {
        type: "checkbox",
        name: "environments",
        message,
        choices,
        pageSize: 10,
        validate: (input: EnvironmentCode[]) => {
          if (input.length === 0) {
            return "Please select at least one environment.";
          }
          return true;
        },
      },
    ]);

    return answers.environments;
  }

  async selectEnvironments(): Promise<EnvironmentCode[]> {
    return this.selectFromEnvironments(
      getAllEnvironments(),
      "Select AI environments to set up (use space to select, enter to confirm):",
      "No environments available."
    );
  }

  async confirmOverride(conflicts: EnvironmentCode[]): Promise<boolean> {
    if (conflicts.length === 0) {
      return true;
    }

    const conflictNames = conflicts.map((id) => getEnvironmentDisplayName(id));

    const answers = await inquirer.prompt([
      {
        type: "confirm",
        name: "proceed",
        message: `The following environments are already set up and will be overwritten:\n  ${conflictNames.join(", ")}\n\nDo you want to continue?`,
        default: false,
      },
    ]);

    return answers.proceed;
  }

  displaySelectionSummary(selected: EnvironmentCode[]): void {
    if (selected.length === 0) {
      ui.warning("No environments selected.");
      return;
    }

    ui.text("\nSelected environments:");
    selected.forEach((envCode) => {
      ui.text(`  ${getEnvironmentDisplayName(envCode)}`);
    });
    ui.breakline();
  }

  async selectGlobalEnvironments(): Promise<EnvironmentCode[]> {
    return this.selectFromEnvironments(
      getGlobalCapableEnvironments(),
      "Select AI environments for global setup (use space to select, enter to confirm):",
      "No environments support global setup."
    );
  }

  async selectSkillEnvironments(): Promise<EnvironmentCode[]> {
    return this.selectFromEnvironments(
      getSkillCapableEnvironments(),
      "Select AI environments for skill installation (use space to select, enter to confirm):",
      "No environments support skills."
    );
  }

  async selectGlobalSkillEnvironments(): Promise<EnvironmentCode[]> {
    return this.selectFromEnvironments(
      getAllEnvironments().filter(env => env.globalSkillPath !== undefined),
      "Select AI environments for global skill installation (use space to select, enter to confirm):",
      "No environments support global skill installation."
    );
  }
}
