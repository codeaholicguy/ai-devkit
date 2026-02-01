import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { AgentManager } from '../lib/AgentManager';
import { ClaudeCodeAdapter } from '../lib/adapters/ClaudeCodeAdapter';
import { AgentStatus, STATUS_CONFIG, AgentInfo } from '../lib/adapters/AgentAdapter';
import { TerminalFocusManager } from '../lib/TerminalFocusManager';
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

    agentCommand
        .command('open <name>')
        .description('Focus a running agent terminal')
        .action(async (name) => {
            try {
                const manager = new AgentManager();
                const focusManager = new TerminalFocusManager();

                manager.registerAdapter(new ClaudeCodeAdapter());

                const agents = await manager.listAgents();
                if (agents.length === 0) {
                    ui.error('No running agents found.');
                    return;
                }

                const resolved = manager.resolveAgent(name, agents);

                if (!resolved) {
                    ui.error(`No agent found matching "${name}".`);
                    ui.info('Available agents:');
                    agents.forEach(a => console.log(`  - ${a.name}`));
                    return;
                }

                let targetAgent = resolved;

                if (Array.isArray(resolved)) {
                    ui.warning(`Multiple agents match "${name}":`);

                    const { selectedAgent } = await inquirer.prompt([
                        {
                            type: 'list',
                            name: 'selectedAgent',
                            message: 'Select an agent to open:',
                            choices: resolved.map(a => ({
                                name: `${a.name} (${a.statusDisplay}) - ${a.summary}`,
                                value: a
                            }))
                        }
                    ]);
                    targetAgent = selectedAgent;
                }

                // Focus terminal
                const agent = targetAgent as AgentInfo;
                if (!agent.pid) {
                    ui.error(`Cannot focus agent "${agent.name}" (No PID found).`);
                    return;
                }

                const spinner = ui.spinner(`Switching focus to ${agent.name}...`);
                spinner.start();

                const location = await focusManager.findTerminal(agent.pid);
                if (!location) {
                    spinner.fail(`Could not find terminal window for agent "${agent.name}" (PID: ${agent.pid}).`);
                    return;
                }

                const success = await focusManager.focusTerminal(location);

                if (success) {
                    spinner.succeed(`Focused ${agent.name}!`);
                } else {
                    spinner.fail(`Failed to switch focus to ${agent.name}.`);
                }

            } catch (error: any) {
                ui.error(`Failed to open agent: ${error.message}`);
                process.exit(1);
            }
        });
}
