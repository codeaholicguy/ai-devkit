import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from '../lib/Config';
import { SkillManager } from '../lib/SkillManager';
import { ui } from '../util/terminal-ui';
import { withErrorHandler } from '../util/errors';
import { truncate, getErrorMessage } from '../util/text';

export function registerSkillCommand(program: Command): void {
  const skillCommand = program
    .command('skill')
    .description('Manage Agent Skills');

  skillCommand
    .command('add <registry-repo> [skill-name]')
    .description('Install a skill from a registry (e.g., ai-devkit skill add anthropics/skills frontend-design)')
    .option('-g, --global', 'Install skill into configured global skill paths (~/<path>)')
    .option('-e, --env <environment...>', 'Target environment(s) for global install (e.g., --global --env claude)')
    .action(async (registryRepo: string, skillName: string | undefined, options: { global?: boolean; env?: string[] }) => {
      try {
        const configManager = new ConfigManager();
        const skillManager = new SkillManager(configManager);

        await skillManager.addSkill(registryRepo, skillName, {
          global: options.global,
          environments: options.env,
        });
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
    .command('list')
    .description('List all installed skills in the current project')
    .action(withErrorHandler('list skills', async () => {
      const configManager = new ConfigManager();
      const skillManager = new SkillManager(configManager);

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
    .description('Remove a skill from the current project')
    .action(withErrorHandler('remove skill', async (skillName: string) => {
      const configManager = new ConfigManager();
      const skillManager = new SkillManager(configManager);

      await skillManager.removeSkill(skillName);
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
