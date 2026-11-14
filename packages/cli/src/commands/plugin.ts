import type { Command } from "commander";
import {
  createPluginManager,
  type PluginUpdateResult,
} from "../services/plugin/plugin-manager.service.js";
import { ui } from "../util/terminal-ui.js";
import { withErrorHandler } from "../util/errors.js";

export function registerPluginCommand(program: Command): void {
  const manager = createPluginManager();
  const pluginCommand = program.command("plugin").description("Manage global AI DevKit plugins");

  pluginCommand
    .command("add <package>")
    .description("Install and enable a global npm plugin")
    .action(
      withErrorHandler("add plugin", async (pluginPackage: string) => {
        await manager.add(pluginPackage);
        ui.success(`Plugin added: ${pluginPackage}`);
      }),
    );

  pluginCommand
    .command("update [package]")
    .description("Update configured plugins to latest, including major versions")
    .action(
      withErrorHandler("update plugins", async (pluginPackage?: string) => {
        const results = await manager.update(pluginPackage);
        if (results.length === 0) {
          ui.warning("No global plugins configured.");
          return;
        }
        ui.table({
          headers: ["package", "status", "version", "notes"],
          rows: results.map((result) => [
            result.name,
            result.status,
            `${result.fromVersion ?? "unknown"} → ${result.toVersion ?? "unknown"}`,
            updateNotes(result),
          ]),
        });
        ui.summary({
          title: "Summary",
          items: [
            {
              type: "success",
              count: results.filter((r) => r.status === "updated").length,
              label: "updated",
            },
            {
              type: "warning",
              count: results.filter((r) => r.status === "up-to-date").length,
              label: "up-to-date",
            },
            {
              type: "error",
              count: results.filter((r) => r.status === "failed").length,
              label: "failed",
            },
          ],
        });
        if (results.some((result) => result.status === "failed")) process.exitCode = 1;
      }),
    );

  pluginCommand
    .command("remove <package>")
    .description("Uninstall and disable a global npm plugin")
    .action(
      withErrorHandler("remove plugin", async (pluginPackage: string) => {
        await manager.remove(pluginPackage);
        ui.success(`Plugin removed: ${pluginPackage}`);
      }),
    );

  pluginCommand
    .command("list")
    .description("List configured global plugins")
    .action(
      withErrorHandler("list plugins", async () => {
        const plugins = await manager.list();

        if (plugins.length === 0) {
          ui.warning("No global plugins configured.");
          return;
        }

        ui.table({
          headers: ["package", "status", "error"],
          rows: plugins.map((plugin) => [plugin.name, plugin.status, plugin.error ?? ""]),
        });
      }),
    );
}

function isMajorCrossing(from?: string, to?: string): boolean {
  return from !== undefined && to !== undefined && from.split(".")[0] !== to.split(".")[0];
}

function updateNotes(result: PluginUpdateResult): string {
  const notes: string[] = [];
  if (isMajorCrossing(result.fromVersion, result.toVersion)) notes.push("MAJOR");
  if (result.status === "failed") {
    if (result.targetVersion) {
      const major = isMajorCrossing(result.fromVersion, result.targetVersion) ? " (MAJOR)" : "";
      notes.push(`Attempted target: ${result.targetVersion}${major}`);
    }
    notes.push(result.error ?? "Update failed");
    notes.push(`Previously installed: ${result.fromVersion ?? "unknown"}`);
    notes.push(
      "Installation may have changed. Manual recovery may be required; no automatic rollback.",
    );
  }
  return notes.join("; ");
}
