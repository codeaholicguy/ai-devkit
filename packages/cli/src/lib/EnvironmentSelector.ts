import { EnvironmentCode, EnvironmentDefinition } from "../types.js";
import {
  getAllEnvironments,
  getEnvironmentDisplayName,
  getSkillCapableEnvironments,
} from "../util/env.js";
import { ui } from "../util/terminal-ui.js";
import { checkbox, confirm } from '@inquirer/prompts';

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

    return checkbox({
      message,
      choices,
      pageSize: 10,
      required: true,
    });
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

    return confirm({
      message: `The following environments are already set up and will be overwritten:\n  ${conflictNames.join(", ")}\n\nDo you want to continue?`,
      default: false,
    });
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
