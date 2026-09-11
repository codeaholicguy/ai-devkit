import { Command } from "commander";
import { checkbox } from "@inquirer/prompts";
import { ConfigManager } from "../../lib/Config.js";
import { EnvironmentSelector } from "../../lib/EnvironmentSelector.js";
import { SkillService } from "../../services/skill/skill.service.js";
import {
  BUILTIN_SKILL_REGISTRY,
  getBuiltinSkillNames,
} from "../../services/skill/skill-builtins.js";
import { ui } from "../../util/terminal-ui.js";
import { ConfigNotFoundError, ValidationError, withErrorHandler } from "../../util/errors.js";
import { isInteractiveTerminal } from "../../util/terminal.js";
import { getErrorMessage } from "../../util/text.js";
import type { AddSkillOptions, RegistrySkillChoice } from "../../services/skill/skill.types.js";
import {
  renderGlobalSkills,
  renderProjectSkills,
  renderSkillIndexRebuild,
  renderSkillInstallResult,
  renderSkillRemoveResult,
  renderSkillSearchResults,
  renderUpdateSummary,
} from "./skill.render.js";

export function registerSkillCommand(program: Command): void {
  const skillCommand = program.command("skill").description("Manage Agent Skills");

  skillCommand
    .command("add [registry-repo] [skill-name]")
    .description(
      "Install a skill from a registry (e.g., ai-devkit skill add anthropics/skills frontend-design)",
    )
    .option("--built-in", "Install all AI DevKit built-in skills")
    .option("-g, --global", "Install skill into configured global skill paths (~/<path>)")
    .option(
      "-e, --env <environment...>",
      "Target environment(s) for global install (e.g., --global --env claude)",
    )
    .action(
      async (
        registryRepo: string | undefined,
        skillName: string | undefined,
        options: { builtIn?: boolean; global?: boolean; env?: string[] },
      ) => {
        try {
          const configManager = new ConfigManager();
          const skillService = new SkillService(configManager);

          if (options.builtIn) {
            if (registryRepo || skillName) {
              ui.warning(
                "Ignoring registry and skill arguments because --built-in installs the curated AI DevKit set.",
              );
            }

            const installOptions = await resolveSkillInstallOptions(configManager, {
              global: options.global,
              environments: options.env,
            });
            for (const builtInSkill of await getBuiltinSkillNames()) {
              renderSkillInstallResult(
                await skillService.addSkill(BUILTIN_SKILL_REGISTRY, builtInSkill, installOptions),
              );
            }

            return;
          }

          if (!registryRepo) {
            ui.error(
              "Missing registry. Use: ai-devkit skill add <registry>/<repo> [skill-name] or ai-devkit skill add --built-in",
            );
            process.exit(1);
            return;
          }

          if (skillName) {
            const installOptions = await resolveSkillInstallOptions(configManager, {
              global: options.global,
              environments: options.env,
            });
            renderSkillInstallResult(
              await skillService.addSkill(registryRepo, skillName, installOptions),
            );
            return;
          }

          if (!isInteractiveTerminal()) {
            throw new Error(
              "Skill name is required in non-interactive mode. Re-run with: ai-devkit skill add <registry> <skill-name>",
            );
          }

          const selectedSkillNames = await promptForSkillSelection(
            await skillService.listInstallableSkills(registryRepo),
          );
          const installOptions = await resolveSkillInstallOptions(configManager, {
            global: options.global,
            environments: options.env,
          });
          renderSkillInstallResult(
            await skillService.addSkills(registryRepo, selectedSkillNames, installOptions),
          );
        } catch (error: unknown) {
          const message = getErrorMessage(error);
          if (message === "Skill selection cancelled.") {
            ui.warning("Skill selection cancelled.");
            return;
          }
          ui.error(`Failed to add skill: ${message}`);
          process.exit(1);
        }
      },
    );

  skillCommand
    .command("add-registry <id> <source>")
    .description("Register a Git or local-folder skill registry")
    .option("-g, --global", "Register in global config (~/.ai-devkit/.ai-devkit.json)")
    .option("-f, --force", "Overwrite a conflicting registry source")
    .action(
      withErrorHandler(
        "add registry",
        async (id: string, source: string, options: { global?: boolean; force?: boolean }) => {
          const skillService = new SkillService(new ConfigManager());
          const status = await skillService.addRegistry(id, source, options);

          if (status === "already-registered") {
            ui.info(`Registry "${id}" is already registered.`);
          } else if (status === "updated") {
            ui.success(`Updated skill registry "${id}".`);
          } else {
            ui.success(`Registered skill registry "${id}".`);
          }
        },
      ),
    );

  skillCommand
    .command("remove-registry <id>")
    .description("Unregister a third-party skill registry")
    .option("-g, --global", "Remove from global config and delete the cached registry")
    .action(
      withErrorHandler("remove registry", async (id: string, options: { global?: boolean }) => {
        const skillService = new SkillService(new ConfigManager());
        const scope = await skillService.removeRegistry(id, options);
        ui.success(`Removed ${scope} skill registry "${id}".`);
      }),
    );

  skillCommand
    .command("list")
    .description("List installed project skills, or global skills with --global")
    .option("-g, --global", "List skills in known configured global skill paths")
    .option(
      "-e, --env <environment...>",
      "Limit global listing to environment(s) (requires --global)",
    )
    .action(
      withErrorHandler("list skills", async (options: { global?: boolean; env?: string[] }) => {
        const configManager = new ConfigManager();
        const skillService = new SkillService(configManager);

        if (options.env && options.env.length > 0 && !options.global) {
          throw new Error("--env can only be used with --global");
        }

        if (options.global) {
          renderGlobalSkills(await skillService.listGlobalSkills(options.env));
          return;
        }

        renderProjectSkills(await skillService.listSkills());
      }),
    );

  skillCommand
    .command("remove <skill-name>")
    .description("Remove a skill from the current project or configured global skill paths")
    .option("-g, --global", "Remove skill from configured global skill paths (~/<path>)")
    .option(
      "-e, --env <environment...>",
      "Limit global removal to specific environment(s) (requires --global)",
    )
    .action(
      withErrorHandler(
        "remove skill",
        async (skillName: string, options: { global?: boolean; env?: string[] }) => {
          const configManager = new ConfigManager();
          const skillService = new SkillService(configManager);

          const result = await skillService.removeSkill(skillName, {
            global: options.global,
            environments: options.env,
          });
          renderSkillRemoveResult(result);
        },
      ),
    );

  skillCommand
    .command("update [registry-id]")
    .description(
      "Update skills from registries (e.g., ai-devkit skill update or ai-devkit skill update anthropic/skills)",
    )
    .action(
      withErrorHandler("update skills", async (registryId?: string) => {
        const configManager = new ConfigManager();
        const skillService = new SkillService(configManager);

        renderUpdateSummary(await skillService.updateSkills(registryId));
      }),
    );

  skillCommand
    .command("find <keyword>")
    .description("Search for skills across all registries")
    .option("--refresh", "Force rebuild the skill index")
    .action(
      withErrorHandler("search skills", async (keyword: string, options: { refresh?: boolean }) => {
        const configManager = new ConfigManager();
        const skillService = new SkillService(configManager);

        renderSkillSearchResults(
          keyword,
          await skillService.findSkills(keyword, { refresh: options.refresh }),
        );
      }),
    );

  skillCommand
    .command("rebuild-index")
    .description("Rebuild the skill index from all registries (for CI use)")
    .option("--output <path>", "Output path for the index file")
    .action(
      withErrorHandler("rebuild index", async (options: { output?: string }) => {
        const configManager = new ConfigManager();
        const skillService = new SkillService(configManager);

        renderSkillIndexRebuild(await skillService.rebuildIndex(options.output));
      }),
    );
}

async function resolveSkillInstallOptions(
  configManager: ConfigManager,
  options: AddSkillOptions,
): Promise<AddSkillOptions> {
  if (options.environments && options.environments.length > 0 && !options.global) {
    throw new ValidationError("--env can only be used with --global");
  }

  const environmentSelector = new EnvironmentSelector();

  if (options.global) {
    if (options.environments && options.environments.length > 0) {
      return options;
    }

    if (!isInteractiveTerminal()) {
      throw new ValidationError("Global skill installation requires at least one environment.");
    }

    return {
      ...options,
      environments: await environmentSelector.selectGlobalSkillEnvironments(),
    };
  }

  ui.info("Loading project configuration...");
  let config = await configManager.read();
  if (!config) {
    ui.info("No .ai-devkit.json found. Creating configuration...");
    config = await configManager.create();
  }

  if (config.environments && config.environments.length > 0) {
    return {
      ...options,
      environments: config.environments,
    };
  }

  if (!isInteractiveTerminal()) {
    throw new ConfigNotFoundError(
      'No environments configured. Run "ai-devkit init" or add "environments" in .ai-devkit.json.',
    );
  }

  const selectedEnvironments = await environmentSelector.selectSkillEnvironments();
  await configManager.update({ environments: selectedEnvironments });
  ui.success("Configuration saved.");

  return {
    ...options,
    environments: selectedEnvironments,
  };
}

async function promptForSkillSelection(skills: RegistrySkillChoice[]): Promise<string[]> {
  try {
    return await checkbox({
      message: "Select skill(s) to install",
      choices: skills.map((skill) => ({
        name: skill.description ? `${skill.name} - ${skill.description}` : skill.name,
        value: skill.name,
      })),
      required: true,
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.name === "ExitPromptError" || error.message.toLowerCase().includes("cancel"))
    ) {
      throw new Error("Skill selection cancelled.");
    }

    throw error;
  }
}
