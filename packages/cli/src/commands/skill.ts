import { Command } from 'commander';
import { checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import { ConfigManager } from '../lib/Config.js';
import { SkillService } from '../services/skill/skill.service.js';
import { BUILTIN_SKILL_REGISTRY, getBuiltinSkillNames } from '../services/skill/skill-builtins.js';
import { ui } from '../util/terminal-ui.js';
import { withErrorHandler } from '../util/errors.js';
import { isInteractiveTerminal } from '../util/terminal.js';
import { truncate, getErrorMessage } from '../util/text.js';
import type { RegistrySkillChoice } from '../services/skill/skill.types.js';

export function registerSkillCommand(program: Command): void {
  const skillCommand = program
    .command('skill')
    .description('Manage Agent Skills');

  skillCommand
    .command('add [registry-repo] [skill-name]')
    .description('Install a skill from a registry (e.g., ai-devkit skill add anthropics/skills frontend-design)')
    .option('--built-in', 'Install all AI DevKit built-in skills')
    .option('-g, --global', 'Install skill into configured global skill paths (~/<path>)')
    .option('-e, --env <environment...>', 'Target environment(s) for global install (e.g., --global --env claude)')
    .action(async (registryRepo: string | undefined, skillName: string | undefined, options: { builtIn?: boolean; global?: boolean; env?: string[] }) => {
      try {
        const configManager = new ConfigManager();
        const skillService = new SkillService(configManager);
        const installOptions = {
          global: options.global,
          environments: options.env,
        };

        if (options.builtIn) {
          if (registryRepo || skillName) {
            ui.warning('Ignoring registry and skill arguments because --built-in installs the curated AI DevKit set.');
          }

          for (const builtInSkill of await getBuiltinSkillNames()) {
            await skillService.addSkill(BUILTIN_SKILL_REGISTRY, builtInSkill, installOptions);
          }

          return;
        }

        if (!registryRepo) {
          ui.error('Missing registry. Use: ai-devkit skill add <registry>/<repo> [skill-name] or ai-devkit skill add --built-in');
          process.exit(1);
          return;
        }

        if (skillName) {
          await skillService.addSkill(registryRepo, skillName, installOptions);
          return;
        }

        if (!isInteractiveTerminal()) {
          throw new Error('Skill name is required in non-interactive mode. Re-run with: ai-devkit skill add <registry> <skill-name>');
        }

        const selectedSkillNames = await promptForSkillSelection(
          await skillService.listInstallableSkills(registryRepo),
        );
        await skillService.addSkills(registryRepo, selectedSkillNames, installOptions);
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        if (message === 'Skill selection cancelled.') {
          ui.warning('Skill selection cancelled.');
          return;
        }
        ui.error(`Failed to add skill: ${message}`);
        process.exit(1);
      }
    });

  skillCommand
    .command('add-registry <id> <source>')
    .description('Register a Git or local-folder skill registry')
    .option('-g, --global', 'Register in global config (~/.ai-devkit/.ai-devkit.json)')
    .option('-f, --force', 'Overwrite a conflicting registry source')
    .action(withErrorHandler('add registry', async (
      id: string,
      source: string,
      options: { global?: boolean; force?: boolean },
    ) => {
      const skillService = new SkillService(new ConfigManager());
      const status = await skillService.addRegistry(id, source, options);

      if (status === 'already-registered') {
        ui.info(`Registry "${id}" is already registered.`);
      } else if (status === 'updated') {
        ui.success(`Updated skill registry "${id}".`);
      } else {
        ui.success(`Registered skill registry "${id}".`);
      }
    }));

  skillCommand
    .command('remove-registry <id>')
    .description('Unregister a third-party skill registry')
    .option('-g, --global', 'Remove from global config and delete the cached registry')
    .action(withErrorHandler('remove registry', async (
      id: string,
      options: { global?: boolean },
    ) => {
      const skillService = new SkillService(new ConfigManager());
      const scope = await skillService.removeRegistry(id, options);
      ui.success(`Removed ${scope} skill registry "${id}".`);
    }));

  skillCommand
    .command('list')
    .description('List installed project skills, or global skills with --global')
    .option('-g, --global', 'List skills in known configured global skill paths')
    .option('-e, --env <environment...>', 'Limit global listing to environment(s) (requires --global)')
    .action(withErrorHandler('list skills', async (options: { global?: boolean; env?: string[] }) => {
      const configManager = new ConfigManager();
      const skillService = new SkillService(configManager);

      if (options.env && options.env.length > 0 && !options.global) {
        throw new Error('--env can only be used with --global');
      }

      if (options.global) {
        const skills = await skillService.listGlobalSkills(options.env);

        if (skills.length === 0) {
          ui.warning('No global skills installed in the selected environments.');
          ui.info('Install a global skill with: ai-devkit skill add <registry>/<repo> [skill-name] --global');
          return;
        }

        ui.text('Globally Installed Skills:', { breakline: true });
        ui.table({
          headers: ['Skill Name', 'Environments', 'Path'],
          rows: skills.map(skill => [
            skill.name,
            skill.environments.join(', '),
            skill.path,
          ]),
          columnStyles: [chalk.cyan, chalk.green, chalk.dim],
        });
        ui.text(`Total: ${skills.length} skill installation(s)`, { breakline: true });
        return;
      }

      const skills = await skillService.listSkills();

      if (skills.length === 0) {
        ui.warning('No skills installed in this project.');
        ui.info('Install a skill with: ai-devkit skill add <registry>/<repo> [skill-name]');
        return;
      }

      ui.text('Installed Skills:', { breakline: true });

      ui.table({
        headers: ['Skill Name', 'Registry', 'Environments'],
        rows: skills.map(skill => [
          skill.name,
          skill.registry,
          skill.environments.join(', ')
        ]),
        columnStyles: [chalk.cyan, chalk.dim, chalk.green]
      });

      ui.text(`Total: ${skills.length} skill(s)`, { breakline: true });
    }));

  skillCommand
    .command('remove <skill-name>')
    .description('Remove a skill from the current project or configured global skill paths')
    .option('-g, --global', 'Remove skill from configured global skill paths (~/<path>)')
    .option('-e, --env <environment...>', 'Limit global removal to specific environment(s) (requires --global)')
    .action(withErrorHandler('remove skill', async (
      skillName: string,
      options: { global?: boolean; env?: string[] },
    ) => {
      const configManager = new ConfigManager();
      const skillService = new SkillService(configManager);

      await skillService.removeSkill(skillName, {
        global: options.global,
        environments: options.env,
      });
    }));

  skillCommand
    .command('update [registry-id]')
    .description('Update skills from registries (e.g., ai-devkit skill update or ai-devkit skill update anthropic/skills)')
    .action(withErrorHandler('update skills', async (registryId?: string) => {
      const configManager = new ConfigManager();
      const skillService = new SkillService(configManager);

      await skillService.updateSkills(registryId);
    }));

  skillCommand
    .command('find <keyword>')
    .description('Search for skills across all registries')
    .option('--refresh', 'Force rebuild the skill index')
    .action(withErrorHandler('search skills', async (keyword: string, options: { refresh?: boolean }) => {
      const configManager = new ConfigManager();
      const skillService = new SkillService(configManager);

      const results = await skillService.findSkills(keyword, { refresh: options.refresh });

      if (results.length === 0) {
        ui.warning(`No skills found matching "${keyword}"`);
        ui.info('Try a different keyword or use --refresh to update the skill index');
        return;
      }

      ui.text(`Found ${results.length} skill(s) matching "${keyword}":`, { breakline: true });

      ui.table({
        headers: ['Skill Name', 'Registry', 'Description'],
        rows: results.map(skill => [
          skill.name,
          skill.registry,
          truncate(skill.description, 60, '...')
        ]),
        columnStyles: [chalk.cyan, chalk.dim, chalk.white]
      });

      ui.text(`\nInstall with: ai-devkit skill add <registry> [skill-name]`, { breakline: true });
    }));

  skillCommand
    .command('rebuild-index')
    .description('Rebuild the skill index from all registries (for CI use)')
    .option('--output <path>', 'Output path for the index file')
    .action(withErrorHandler('rebuild index', async (options: { output?: string }) => {
      const configManager = new ConfigManager();
      const skillService = new SkillService(configManager);

      await skillService.rebuildIndex(options.output);
    }));
}

async function promptForSkillSelection(skills: RegistrySkillChoice[]): Promise<string[]> {
  try {
    return await checkbox({
      message: 'Select skill(s) to install',
      choices: skills.map(skill => ({
        name: skill.description ? `${skill.name} - ${skill.description}` : skill.name,
        value: skill.name,
      })),
      required: true,
    });
  } catch (error: unknown) {
    if (error instanceof Error &&
      (error.name === 'ExitPromptError' || error.message.toLowerCase().includes('cancel'))) {
      throw new Error('Skill selection cancelled.');
    }

    throw error;
  }
}
