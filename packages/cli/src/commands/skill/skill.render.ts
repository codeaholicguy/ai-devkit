import chalk from "chalk";
import { ui } from "../../util/terminal-ui.js";
import { truncate } from "../../util/text.js";
import type {
  GlobalInstalledSkill,
  InstalledSkill,
  SkillInstallResult,
  SkillRemoveResult,
} from "../../services/skill/skill.types.js";
import type { UpdateSummary } from "../../services/skill/registry/skill-registry.service.js";
import type {
  SkillEntry,
  SkillIndexRebuildResult,
} from "../../services/skill/index/skill-index.service.js";

function formatCount(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function renderMetadataLine(label: string, value: string): void {
  ui.text(chalk.dim(`  ${label}: ${value}`));
}

function renderResultLine(
  outcome: "success" | "warning" | "error",
  target: string,
  actionOrReason: string,
): void {
  const line = `${outcome === "success" ? "✔" : outcome === "warning" ? "⚠" : "✖"} ${target} — ${actionOrReason}`;
  const color =
    outcome === "success"
      ? chalk.green
      : outcome === "warning"
        ? chalk.yellow
        : chalk.red;

  ui.text(color(line));
}

export function renderSkillInstallResult(result: SkillInstallResult): void {
  const skillNames = [
    ...new Set(result.items.map((item) => item.skillName)),
  ].join(", ");

  if (result.status === "installed") {
    ui.success(`Installed ${skillNames} from ${result.registryId}`);
  } else {
    ui.warning(`${skillNames} already installed from ${result.registryId}`);
  }

  renderMetadataLine("Source", result.registryId);
  renderMetadataLine(
    `Installed to (${result.installMode})`,
    result.environments.join(", "),
  );

  for (const item of result.items) {
    const actionOrReason =
      item.action === "skipped" ? "already exists, skipped" : item.action;
    renderResultLine(
      item.action === "skipped" ? "warning" : "success",
      item.target,
      actionOrReason,
    );
  }
}

export function renderSkillRemoveResult(result: SkillRemoveResult): void {
  if (result.removedTargets.length === 0) {
    ui.warning(
      result.scope === "global"
        ? `Skill "${result.skillName}" not found in selected global environments. Nothing to remove.`
        : `Skill "${result.skillName}" not found. Nothing to remove.`,
    );
    if (result.scope === "project") {
      ui.info('Tip: Run "ai-devkit skill list" to see installed skills.');
    }
    return;
  }

  ui.success(
    result.scope === "global"
      ? `Removed ${result.skillName} from ${formatCount(result.removedTargets.length, "global location")}`
      : `Removed ${result.skillName} from ${formatCount(result.removedTargets.length, "location")}`,
  );
  renderMetadataLine(
    "Note",
    result.scope === "global"
      ? "Cached copy in ~/.ai-devkit/skills/ preserved."
      : "Cached copy in ~/.ai-devkit/skills/ preserved for other projects.",
  );

  for (const target of result.removedTargets) {
    renderResultLine("success", target, "removed");
  }
}

export function renderUpdateSummary(summary: UpdateSummary): void {
  const errors = summary.results.filter((result) => result.status === "error");

  ui.summary({
    title: "Summary",
    items: [
      { type: "success", count: summary.successful, label: "updated" },
      { type: "warning", count: summary.skipped, label: "skipped" },
      { type: "error", count: summary.failed, label: "failed" },
    ],
    details:
      errors.length > 0
        ? {
            title: "Errors",
            items: errors.map((error) => {
              let tip: string | undefined;

              if (
                error.message.includes("uncommitted") ||
                error.message.includes("unstaged")
              ) {
                tip = `Run 'git status' in ~/.ai-devkit/skills/${error.registryId} to see details.`;
              } else if (
                error.message.includes("network") ||
                error.message.includes("timeout")
              ) {
                tip = "Check your internet connection and try again.";
              }

              return {
                message: `${error.registryId}: ${error.message}`,
                tip,
              };
            }),
          }
        : undefined,
  });
}

export function renderProjectSkills(skills: InstalledSkill[]): void {
  if (skills.length === 0) {
    ui.warning("No skills installed in this project.");
    ui.info(
      "Install a skill with: ai-devkit skill add <registry>/<repo> [skill-name]",
    );
    return;
  }

  ui.text("Installed Skills:", { breakline: true });
  ui.table({
    headers: ["Skill Name", "Registry", "Environments"],
    rows: skills.map((skill) => [
      skill.name,
      skill.registry,
      skill.environments.join(", "),
    ]),
    columnStyles: [chalk.cyan, chalk.dim, chalk.green],
  });
  ui.text(`Total: ${formatCount(skills.length, "skill")}`, { breakline: true });
}

export function renderGlobalSkills(skills: GlobalInstalledSkill[]): void {
  if (skills.length === 0) {
    ui.warning("No global skills installed in the selected environments.");
    ui.info(
      "Install a global skill with: ai-devkit skill add <registry>/<repo> [skill-name] --global",
    );
    return;
  }

  ui.text("Globally Installed Skills:", { breakline: true });
  ui.table({
    headers: ["Skill Name", "Environments", "Path"],
    rows: skills.map((skill) => [
      skill.name,
      skill.environments.join(", "),
      skill.path,
    ]),
    columnStyles: [chalk.cyan, chalk.green, chalk.dim],
  });
  ui.text(`Total: ${formatCount(skills.length, "skill installation")}`, {
    breakline: true,
  });
}

export function renderSkillSearchResults(
  keyword: string,
  results: SkillEntry[],
): void {
  if (results.length === 0) {
    ui.warning(`No skills found matching "${keyword}"`);
    ui.info(
      "Try a different keyword or use --refresh to update the skill index",
    );
    return;
  }

  ui.text(
    `Found ${formatCount(results.length, "skill")} matching "${keyword}":`,
    {
      breakline: true,
    },
  );
  ui.table({
    headers: ["Skill Name", "Registry", "Description"],
    rows: results.map((skill) => [
      skill.name,
      skill.registry,
      truncate(skill.description, 60, "..."),
    ]),
    columnStyles: [chalk.cyan, chalk.dim, chalk.white],
  });
  ui.text("\nInstall with: ai-devkit skill add <registry> [skill-name]", {
    breakline: true,
  });
}

export function renderSkillIndexRebuild(result: SkillIndexRebuildResult): void {
  ui.success(`Skill index rebuilt: ${formatCount(result.skillCount, "skill")}`);
  ui.info(`Written to: ${result.outputPath}`);
}
