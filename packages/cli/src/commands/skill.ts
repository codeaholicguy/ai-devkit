import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from '../lib/Config';
import { SkillManager } from '../lib/SkillManager';
import { ui } from '../util/terminal-ui';

export function registerSkillCommand(program: Command): void {
  const skillCommand = program
    .command('skill')
    .description('Manage Agent Skills');

  skillCommand
    .command('add <registry-repo> <skill-name>')
    .description('Install a skill from a registry (e.g., ai-devkit skill add anthropics/skills frontend-design)')
    .action(async (registryRepo: string, skillName: string) => {
      try {
        const configManager = new ConfigManager();
        const skillManager = new SkillManager(configManager);

        await skillManager.addSkill(registryRepo, skillName);
      } catch (error: any) {
        ui.error(`Failed to add skill: ${error.message}`);
        process.exit(1);
      }
    });

  skillCommand
    .command('list')
    .description('List all installed skills in the current project')
    .action(async () => {
      try {
        const configManager = new ConfigManager();
        const skillManager = new SkillManager(configManager);

        const skills = await skillManager.listSkills();

        if (skills.length === 0) {
          ui.warning('No skills installed in this project.');
          ui.info('Install a skill with: ai-devkit skill add <registry>/<repo> <skill-name>');
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
      } catch (error: any) {
        ui.error(`Failed to list skills: ${error.message}`);
        process.exit(1);
      }
    });

  skillCommand
    .command('remove <skill-name>')
    .description('Remove a skill from the current project')
    .action(async (skillName: string) => {
      try {
        const configManager = new ConfigManager();
        const skillManager = new SkillManager(configManager);

        await skillManager.removeSkill(skillName);
      } catch (error: any) {
        ui.error(`Failed to remove skill: ${error.message}`);
        process.exit(1);
      }
    });

  skillCommand
    .command('update [registry-id]')
    .description('Update skills from registries (e.g., ai-devkit skill update or ai-devkit skill update anthropic/skills)')
    .action(async (registryId?: string) => {
      try {
        const configManager = new ConfigManager();
        const skillManager = new SkillManager(configManager);

        await skillManager.updateSkills(registryId);
      } catch (error: any) {
        ui.error(`Failed to update skills: ${error.message}`);
        process.exit(1);
      }
    });

  skillCommand
    .command('find <keyword>')
    .description('Search for skills across all registries')
    .option('--refresh', 'Force rebuild the skill index')
    .action(async (keyword: string, options: { refresh?: boolean }) => {
      try {
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
            skill.description.length > 60 ? skill.description.substring(0, 57) + '...' : skill.description
          ]),
          columnStyles: [chalk.cyan, chalk.dim, chalk.white]
        });

        ui.text(`\nInstall with: ai-devkit skill add <registry> <skill-name>`, { breakline: true });
      } catch (error: any) {
        ui.error(`Failed to search skills: ${error.message}`);
        process.exit(1);
      }
    });

  skillCommand
    .command('rebuild-index')
    .description('Rebuild the skill index from all registries (for CI use)')
    .option('--output <path>', 'Output path for the index file')
    .action(async (options: { output?: string }) => {
      try {
        const configManager = new ConfigManager();
        const skillManager = new SkillManager(configManager);

        await skillManager.rebuildIndex(options.output);
      } catch (error: any) {
        ui.error(`Failed to rebuild index: ${error.message}`);
        process.exit(1);
      }
    });
}