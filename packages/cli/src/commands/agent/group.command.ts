import { Command } from 'commander';
import chalk from 'chalk';
import { ui } from '../../util/terminal-ui.js';
import { withErrorHandler } from '../../util/errors.js';
import {
    AgentGroupNotFoundError,
    createDefaultAgentGroupService,
} from '../../services/agent/agent-group.service.js';

function collectAgentMember(value: string, previous: string[]): string[] {
    return [...previous, value];
}

export function registerAgentGroupCommand(agentCommand: Command): void {
    const groupCommand = agentCommand
        .command('group')
        .description('Manage named groups of agents');

    groupCommand
        .command('create <name>')
        .description('Create an agent group')
        .option('--agent <identifier>', 'Agent identifier to include in the group', collectAgentMember, [] as string[])
        .action(withErrorHandler('manage agent group', async (name: string, options: { agent?: string[] }) => {
            const group = createDefaultAgentGroupService().create(name, options.agent ?? []);
            ui.success(`Created agent group "${group.name}" with ${group.members.length} member(s).`);
        }));

    groupCommand
        .command('update <name>')
        .description('Replace all members in an agent group')
        .option('--agent <identifier>', 'Agent identifier to include in the group', collectAgentMember, [] as string[])
        .action(withErrorHandler('manage agent group', async (name: string, options: { agent?: string[] }) => {
            const group = createDefaultAgentGroupService().update(name, options.agent ?? []);
            ui.success(`Updated agent group "${group.name}" with ${group.members.length} member(s).`);
        }));

    groupCommand
        .command('add <name> <identifier>')
        .description('Add an agent identifier to a group')
        .action(withErrorHandler('manage agent group', async (name: string, identifier: string) => {
            const group = createDefaultAgentGroupService().addMember(name, identifier);
            ui.success(`Agent group "${group.name}" now has ${group.members.length} member(s).`);
        }));

    groupCommand
        .command('remove-agent <name> <identifier>')
        .description('Remove an agent identifier from a group')
        .action(withErrorHandler('manage agent group', async (name: string, identifier: string) => {
            const group = createDefaultAgentGroupService().removeMember(name, identifier);
            ui.success(`Agent group "${group.name}" now has ${group.members.length} member(s).`);
        }));

    groupCommand
        .command('remove <name>')
        .description('Remove an agent group')
        .action(withErrorHandler('manage agent group', async (name: string) => {
            createDefaultAgentGroupService().remove(name);
            ui.success(`Removed agent group "${name}".`);
        }));

    groupCommand
        .command('list')
        .description('List configured agent groups')
        .action(withErrorHandler('manage agent group', async () => {
            const groups = createDefaultAgentGroupService().list();
            if (groups.length === 0) {
                ui.info('No agent groups configured.');
                return;
            }
            ui.table({
                headers: ['Group', 'Members'],
                rows: groups.map((group) => [group.name, group.members.join(', ')]),
                columnStyles: [
                    (text) => chalk.cyan(text),
                    (text) => text,
                ],
            });
        }));

    groupCommand
        .command('detail <name>')
        .description('Show one configured agent group')
        .action(withErrorHandler('manage agent group', async (name: string) => {
            const group = createDefaultAgentGroupService().get(name);
            if (!group) {
                throw new AgentGroupNotFoundError(name);
            }
            ui.text(`Agent Group: ${group.name}`, { breakline: true });
            for (const member of group.members) {
                ui.text(`  - ${member}`);
            }
        }));
}
