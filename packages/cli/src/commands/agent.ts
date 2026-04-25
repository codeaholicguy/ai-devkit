import os from 'os';
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
    AgentManager,
    ClaudeCodeAdapter,
    CodexAdapter,
    GeminiCliAdapter,
    AgentStatus,
    TerminalFocusManager,
    TtyWriter,
    type AgentInfo,
    type AgentType,
} from '@ai-devkit/agent-manager';
import { ui } from '../util/terminal-ui';
import { withErrorHandler } from '../util/errors';

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

function formatCwd(projectPath?: string): string {
    if (!projectPath) return '';
    const home = os.homedir();
    if (projectPath.startsWith(home)) {
        return '~' + projectPath.slice(home.length);
    }
    return projectPath;
}

function formatWorkOn(summary?: string): string {
    const firstLine = (summary ?? '').split(/\r?\n/, 1)[0] || '';
    return firstLine || 'No active task';
}

function createAgentManager(): AgentManager {
    const manager = new AgentManager();
    manager.registerAdapter(new ClaudeCodeAdapter());
    manager.registerAdapter(new CodexAdapter());
    manager.registerAdapter(new GeminiCliAdapter());
    return manager;
}

export function registerAgentCommand(program: Command): void {
    const agentCommand = program
        .command('agent')
        .description('Manage AI Agents');

    agentCommand
        .command('list')
        .description('List all running AI agents')
        .option('-j, --json', 'Output as JSON')
        .action(withErrorHandler('list agents', async (options) => {
            const manager = createAgentManager();
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
                formatCwd(agent.projectPath),
                formatType(agent.type),
                formatStatus(agent.status),
                formatWorkOn(agent.summary),
                formatRelativeTime(agent.lastActive)
            ]);

            ui.table({
                headers: ['Agent', 'CWD', 'Type', 'Status', 'Working On', 'Active'],
                rows: rows,
                columnStyles: [
                    (text) => chalk.cyan(text),
                    (text) => chalk.dim(text),
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

            const waitingCount = agents.filter(a => a.status === AgentStatus.WAITING).length;
            if (waitingCount > 0) {
                ui.breakline();
                ui.warning(`${waitingCount} agent(s) waiting for input.`);
            }
        }));

    agentCommand
        .command('open <name>')
        .description('Focus a running agent terminal')
        .action(withErrorHandler('open agent', async (name) => {
            const manager = createAgentManager();
            const focusManager = new TerminalFocusManager();

            const agents = await manager.listAgents();
            if (agents.length === 0) {
                ui.error('No running agents found.');
                return;
            }

            const resolved = manager.resolveAgent(name, agents);

            if (!resolved) {
                ui.error(`No agent found matching "${name}".`);
                ui.info('Available agents:');
                agents.forEach(a => ui.text(`  - ${a.name}`));
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
        }));

    agentCommand
        .command('send <message>')
        .description('Send a message to a running agent')
        .requiredOption('--id <identifier>', 'Agent name or partial match')
        .action(withErrorHandler('send message', async (message, options) => {
            const manager = createAgentManager();

            const agents = await manager.listAgents();
            if (agents.length === 0) {
                ui.error('No running agents found.');
                return;
            }

            const resolved = manager.resolveAgent(options.id, agents);

            if (!resolved) {
                ui.error(`No agent found matching "${options.id}".`);
                ui.info('Available agents:');
                agents.forEach(a => ui.text(`  - ${a.name}`));
                return;
            }

            if (Array.isArray(resolved)) {
                ui.error(`Multiple agents match "${options.id}":`);
                resolved.forEach(a => ui.text(`  - ${a.name} (${formatStatus(a.status)})`));
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
        }));

    agentCommand
        .command('detail')
        .description('Show detailed information about a running agent')
        .requiredOption('--id <name>', 'Agent name (as shown in agent list)')
        .option('-j, --json', 'Output as JSON')
        .option('--full', 'Show entire conversation history')
        .option('--tail <n>', 'Show last N messages (default: 20)', '20')
        .option('--verbose', 'Include tool call/result details')
        .action(withErrorHandler('get agent detail', async (options) => {
            const manager = createAgentManager();
            const agents = await manager.listAgents();
            if (agents.length === 0) {
                ui.error('No running agents found.');
                return;
            }

            const resolved = manager.resolveAgent(options.id, agents);

            if (!resolved) {
                ui.error(`No agent found matching "${options.id}".`);
                ui.info('Available agents:');
                agents.forEach(a => ui.text(`  - ${a.name}`));
                return;
            }

            if (Array.isArray(resolved)) {
                ui.error(`Multiple agents match "${options.id}":`);
                resolved.forEach(a => ui.text(`  - ${a.name} (${formatStatus(a.status)})`));
                ui.info('Please use a more specific name.');
                return;
            }

            const agent = resolved as AgentInfo;

            if (!agent.sessionFilePath) {
                ui.error(`No session file found for agent "${agent.name}".`);
                return;
            }

            const adapter = manager.getAdapter(agent.type);
            if (!adapter) {
                ui.error(`Unsupported agent type: ${agent.type}`);
                return;
            }

            const conversation = adapter.getConversation(agent.sessionFilePath, {
                verbose: options.verbose,
            });

            const tailCount = options.full ? conversation.length : parseInt(options.tail, 10) || 20;
            const displayMessages = conversation.slice(-tailCount);
            const isTruncated = displayMessages.length < conversation.length;

            const startTime = conversation.length > 0 && conversation[0].timestamp
                ? new Date(conversation[0].timestamp)
                : agent.lastActive;

            if (options.json) {
                const output = {
                    sessionId: agent.sessionId,
                    cwd: agent.projectPath,
                    startTime,
                    status: agent.status,
                    type: agent.type,
                    name: agent.name,
                    lastActive: agent.lastActive,
                    conversation: displayMessages,
                };
                console.log(JSON.stringify(output, null, 2));
                return;
            }

            ui.text('Agent Detail', { breakline: true });
            ui.text(chalk.dim('─'.repeat(40)));
            ui.text(`  ${chalk.bold('Session ID:')}  ${agent.sessionId}`);
            ui.text(`  ${chalk.bold('CWD:')}         ${formatCwd(agent.projectPath)}`);
            ui.text(`  ${chalk.bold('Start Time:')}  ${new Date(startTime).toLocaleString()}`);
            ui.text(`  ${chalk.bold('Last Active:')} ${formatRelativeTime(agent.lastActive)}`);
            ui.text(`  ${chalk.bold('Status:')}      ${formatStatus(agent.status)}`);
            ui.text(`  ${chalk.bold('Type:')}        ${formatType(agent.type)}`);
            ui.breakline();
            const label = isTruncated
                ? `Conversation (last ${displayMessages.length} of ${conversation.length} messages)`
                : `Conversation (${displayMessages.length} messages)`;
            ui.text(label, { breakline: false });
            ui.text(chalk.dim('─'.repeat(40)));

            for (const msg of displayMessages) {
                const time = msg.timestamp
                    ? chalk.dim(`[${new Date(msg.timestamp).toLocaleTimeString()}]`)
                    : '';
                const roleColor = msg.role === 'user'
                    ? chalk.green
                    : msg.role === 'assistant'
                        ? chalk.cyan
                        : chalk.yellow;
                ui.text(`${time} ${roleColor(msg.role + ':')}`);
                const lines = msg.content.split('\n');
                for (const line of lines) {
                    ui.text(`  ${line}`);
                }
                ui.breakline();
            }

            if (isTruncated) {
                ui.info(`Showing last ${displayMessages.length} of ${conversation.length} messages. Use --full to see all.`);
            }
        }));
}
