import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
    AgentManager,
    ClaudeCodeAdapter,
    CodexAdapter,
    AgentStatus,
    TerminalFocusManager,
    TtyWriter,
    type AgentInfo,
    type AgentType,
} from '@ai-devkit/agent-manager';
import { ui } from '../util/terminal-ui';

const STATUS_DISPLAY: Record<AgentStatus, { emoji: string; label: string }> = {
    [AgentStatus.RUNNING]: { emoji: '🟢', label: 'run' },
    [AgentStatus.WAITING]: { emoji: '🟡', label: 'wait' },
    [AgentStatus.IDLE]: { emoji: '⚪', label: 'idle' },
    [AgentStatus.UNKNOWN]: { emoji: '❓', label: 'unknown' },
};

function formatStatus(status: AgentStatus): string {
    const config = STATUS_DISPLAY[status] || STATUS_DISPLAY[AgentStatus.UNKNOWN];
    return `${config.emoji} ${config.label}`;
}

function formatRelativeTime(timestamp: Date): string {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
}

const TYPE_LABELS: Record<AgentType, string> = {
    claude: 'Claude Code',
    codex: 'Codex',
    gemini_cli: 'Gemini CLI',
    other: 'Other',
};

function formatType(type: AgentType): string {
    return TYPE_LABELS[type] ?? type;
}

function formatWorkOn(summary?: string): string {
    const firstLine = (summary ?? '').split(/\r?\n/, 1)[0] || '';
    return firstLine || 'No active task';
}

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
                manager.registerAdapter(new CodexAdapter());

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
                    formatType(agent.type),
                    formatStatus(agent.status),
                    formatWorkOn(agent.summary),
                    formatRelativeTime(agent.lastActive)
                ]);

                ui.table({
                    headers: ['Agent', 'Type', 'Status', 'Working On', 'Active'],
                    rows: rows,
                    columnStyles: [
                        (text) => chalk.cyan(text),
                        (text) => chalk.dim(text),
                        (text) => {
                            if (text.includes(STATUS_DISPLAY[AgentStatus.RUNNING].label)) return chalk.green(text);
                            if (text.includes(STATUS_DISPLAY[AgentStatus.WAITING].label)) return chalk.yellow(text);
                            if (text.includes(STATUS_DISPLAY[AgentStatus.IDLE].label)) return chalk.dim(text);
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
                manager.registerAdapter(new CodexAdapter());

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
                                name: `${a.name} (${formatStatus(a.status)}) - ${a.summary}`,
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

    agentCommand
        .command('send <message>')
        .description('Send a message to a running agent')
        .requiredOption('--id <identifier>', 'Agent name, slug, or partial match')
        .action(async (message, options) => {
            try {
                const manager = new AgentManager();
                manager.registerAdapter(new ClaudeCodeAdapter());
                manager.registerAdapter(new CodexAdapter());

                const agents = await manager.listAgents();
                if (agents.length === 0) {
                    ui.error('No running agents found.');
                    return;
                }

                const resolved = manager.resolveAgent(options.id, agents);

                if (!resolved) {
                    ui.error(`No agent found matching "${options.id}".`);
                    ui.info('Available agents:');
                    agents.forEach(a => console.log(`  - ${a.name}`));
                    return;
                }

                if (Array.isArray(resolved)) {
                    ui.error(`Multiple agents match "${options.id}":`);
                    resolved.forEach(a => console.log(`  - ${a.name} (${formatStatus(a.status)})`));
                    ui.info('Please use a more specific identifier.');
                    return;
                }

                const agent = resolved as AgentInfo;

                if (agent.status !== AgentStatus.WAITING) {
                    ui.warning(`Agent "${agent.name}" is not waiting for input (status: ${agent.status}). Sending anyway.`);
                }

                const focusManager = new TerminalFocusManager();
                const location = await focusManager.findTerminal(agent.pid);
                if (!location) {
                    ui.error(`Cannot find terminal for agent "${agent.name}" (PID: ${agent.pid}).`);
                    return;
                }

                await TtyWriter.send(location, message);
                ui.success(`Sent message to ${agent.name}.`);

            } catch (error: any) {
                ui.error(`Failed to send message: ${error.message}`);
                process.exit(1);
            }
        });
}
