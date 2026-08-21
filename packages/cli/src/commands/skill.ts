import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from '../lib/Config.js';
import { GlobalConfigManager } from '../lib/GlobalConfig.js';
import { SkillManager } from '../lib/SkillManager.js';
import { BUILTIN_SKILL_NAMES, BUILTIN_SKILL_REGISTRY } from '../constants.js';
import { ui } from '../util/terminal-ui.js';
import { withErrorHandler } from '../util/errors.js';
import { truncate, getErrorMessage } from '../util/text.js';
import { validateRegistryId } from '../util/skill.js';
import { planSkillRegistryAdd } from '../util/skill-registry.js';

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
        const skillManager = new SkillManager(configManager);
        const installOptions = {
          global: options.global,
          environments: options.env,
        };

        if (options.builtIn) {
          if (registryRepo || skillName) {
            ui.warning('Ignoring registry and skill arguments because --built-in installs the curated AI DevKit set.');
          }

          for (const builtInSkill of BUILTIN_SKILL_NAMES) {
            await skillManager.addSkill(BUILTIN_SKILL_REGISTRY, builtInSkill, installOptions);
          }

          return;
        }

        if (!registryRepo) {
          ui.error('Missing registry. Use: ai-devkit skill add <registry>/<repo> [skill-name] or ai-devkit skill add --built-in');
          process.exit(1);
          return;
        }

        await skillManager.addSkill(registryRepo, skillName, installOptions);
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
    .command('add-registry <id> <url>')
    .description('Register a third-party skill registry')
    .option('-g, --global', 'Register in global config (~/.ai-devkit/.ai-devkit.json)')
    .option('-f, --force', 'Overwrite a conflicting registry URL')
    .action(withErrorHandler('add registry', async (
      id: string,
      url: string,
      options: { global?: boolean; force?: boolean },
    ) => {
      validateRegistryId(id);
      const configManager = options.global
        ? new GlobalConfigManager()
        : new ConfigManager();

      const registries = await configManager.getSkillRegistries();
      const mutation = planSkillRegistryAdd(registries, id, url, { force: options.force });
      await configManager.addSkillRegistry(id, url, { force: options.force });
      if (mutation.status !== 'already-registered') {
        const skillManager = new SkillManager(new ConfigManager());
        await skillManager.cacheRegistry(id, url);
        await skillManager.updateSkillIndexForRegistry(id);
      }

      if (mutation.status === 'already-registered') {
        ui.info(`Registry "${id}" is already registered.`);
      } else if (mutation.status === 'updated') {
        ui.success(`Updated skill registry "${id}".`);
      } else {
        ui.success(`Registered skill registry "${id}".`);
      }
    }));

  skillCommand
    .command('list')
    .description('List installed project skills, or global skills with --global')
    .option('-g, --global', 'List skills in known configured global skill paths')
    .option('-e, --env <environment...>', 'Limit global listing to environment(s) (requires --global)')
    .action(withErrorHandler('list skills', async (options: { global?: boolean; env?: string[] }) => {
      const configManager = new ConfigManager();
      const skillManager = new SkillManager(configManager);

      if (options.env && options.env.length > 0 && !options.global) {
        throw new Error('--env can only be used with --global');
      }

      if (options.global) {
        const skills = await skillManager.listGlobalSkills(options.env);

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

      const skills = await skillManager.listSkills();

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
      const skillManager = new SkillManager(configManager);

      await skillManager.removeSkill(skillName, {
        global: options.global,
        environments: options.env,
      });
    }));

  skillCommand
    .command('update [registry-id]')
    .description('Update skills from registries (e.g., ai-devkit skill update or ai-devkit skill update anthropic/skills)')
    .action(withErrorHandler('update skills', async (registryId?: string) => {
      const configManager = new ConfigManager();
      const skillManager = new SkillManager(configManager);

      await skillManager.updateSkills(registryId);
    }));

  skillCommand
    .command('find <keyword>')
    .description('Search for skills across all registries')
    .option('--refresh', 'Force rebuild the skill index')
    .action(withErrorHandler('search skills', async (keyword: string, options: { refresh?: boolean }) => {
      const configManager = new ConfigManager();
      const skillManager = new SkillManager(configManager);

      const results = await skillManager.findSkills(keyword, { refresh: options.refresh });

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
      const skillManager = new SkillManager(configManager);

      await skillManager.rebuildIndex(options.output);
    }));
}
