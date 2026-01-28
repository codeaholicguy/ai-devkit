import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from '../lib/Config';
import { SkillManager } from '../lib/SkillManager';

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
        console.error(chalk.red(`\nFailed to add skill: ${error.message}\n`));
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
          console.log(chalk.yellow('\nNo skills installed in this project.'));
          console.log(chalk.dim('Install a skill with: ai-devkit skill add <registry>/<repo> <skill-name>\n'));
          return;
        }

        console.log(chalk.bold('\nInstalled Skills:\n'));

        const maxNameLength = Math.max(...skills.map(s => s.name.length), 10);
        const maxRegistryLength = Math.max(...skills.map(s => s.registry.length), 15);

        console.log(
          chalk.dim('  ') +
          chalk.bold('Skill Name'.padEnd(maxNameLength + 2)) +
          chalk.bold('Registry'.padEnd(maxRegistryLength + 2)) +
          chalk.bold('Environments')
        );
        console.log(chalk.dim('  ' + '─'.repeat(maxNameLength + maxRegistryLength + 30)));

        skills.forEach(skill => {
          console.log(
            '  ' +
            chalk.cyan(skill.name.padEnd(maxNameLength + 2)) +
            chalk.dim(skill.registry.padEnd(maxRegistryLength + 2)) +
            chalk.green(skill.environments.join(', '))
          );
        });

        console.log(chalk.dim(`\n  Total: ${skills.length} skill(s)\n`));
      } catch (error: any) {
        console.error(chalk.red(`\nFailed to list skills: ${error.message}\n`));
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
        console.error(chalk.red(`\nFailed to remove skill: ${error.message}\n`));
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
        console.error(chalk.red(`\nFailed to update skills: ${error.message}\n`));
        process.exit(1);
      }
    });
}