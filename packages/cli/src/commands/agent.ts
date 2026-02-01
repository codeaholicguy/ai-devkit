import { Command } from 'commander';
import chalk from 'chalk';
import { AgentManager } from '../lib/AgentManager';
import { ClaudeCodeAdapter } from '../lib/adapters/ClaudeCodeAdapter';
import { AgentStatus, STATUS_CONFIG } from '../lib/adapters/AgentAdapter';
import { ui } from '../util/terminal-ui';

export function registerAgentCommand(program: Command): void {
    const agentCommand = program
        .command('agent')
        .description('Manage AI Agents');

    agentCommand
        .command('list')
        .description('List all running AI agents')
        .option('-j, --json', 'Output as JSON')
        .action(async (options) => {
            try {
                const manager = new AgentManager();

                // Register adapters
                // In the future, we might load these dynamically or based on config
                manager.registerAdapter(new ClaudeCodeAdapter());

                const agents = await manager.listAgents();

                if (options.json) {
                    console.log(JSON.stringify(agents, null, 2));
                    return;
                }

                if (agents.length === 0) {
                    ui.info('No running agents detected.');
                    return;
                }

                ui.text('Running Agents:', { breakline: true });

                const rows = agents.map(agent => [
                    agent.name,
                    agent.statusDisplay,
                    agent.summary || 'No active task',
                    agent.lastActiveDisplay
                ]);

                ui.table({
                    headers: ['Agent', 'Status', 'Working On', 'Active'],
                    rows: rows,
                    // Custom column styling
                    // 0: Name (cyan)
                    // 1: Status (dynamic based on content)
                    // 2: Working On (standard)
                    // 3: Active (dim)
                    columnStyles: [
                        (text) => chalk.cyan(text),
                        (text) => {
                            // Extract status keyword to determine color
                            if (text.includes(STATUS_CONFIG[AgentStatus.RUNNING].label)) return chalk.green(text);
                            if (text.includes(STATUS_CONFIG[AgentStatus.WAITING].label)) return chalk.yellow(text);
                            if (text.includes(STATUS_CONFIG[AgentStatus.IDLE].label)) return chalk.dim(text);
                            return chalk.gray(text);
                        },
                        (text) => text,
                        (text) => chalk.dim(text)
                    ]
                });

                // Add summary footer if there are waiting agents
                const waitingCount = agents.filter(a => a.status === AgentStatus.WAITING).length;
                if (waitingCount > 0) {
                    ui.breakline();
                    ui.warning(`${waitingCount} agent(s) waiting for input.`);
                }

            } catch (error: any) {
                ui.error(`Failed to list agents: ${error.message}`);
                process.exit(1);
            }
        });
}
