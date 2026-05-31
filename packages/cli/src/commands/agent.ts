import fs from 'fs';
import os from 'os';
import path from 'path';
import { createElement } from 'react';
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { render } from 'ink';
import {
    AgentManager,
    type AgentAdapter,
    ClaudeCodeAdapter,
    CodexAdapter,
    GeminiCliAdapter,
    OpenCodeAdapter,
    AgentStatus,
    TerminalFocusManager,
    TtyWriter,
    AgentRegistry,
    RenameNotFoundError,
    RenameConflictError,
    TmuxManager,
    AGENTS,
    type StartableAgentType,
    type AgentInfo,
    type AgentType,
    type ConversationMessage,
    type SessionSummary,
} from '@ai-devkit/agent-manager';
import { ui } from '../util/terminal-ui.js';
import { withErrorHandler } from '../util/errors.js';
import {
    formatFirstMessage,
    parseLimit,
    resolveListSessionsOptions,
    toJsonSession,
} from '../util/sessions.js';
import {
    waitForAgentResponse,
    startAgent,
    TmuxUnavailableError,
    AgentNameInUseError,
    AgentPidPollTimeoutError,
} from '../services/agent/agent.service.js';
import { parseMilliseconds } from '../util/time.js';
import { ConsoleApp } from '../tui/console/ConsoleApp.js';

const AGENT_SEND_WAIT_POLL_INTERVAL_MS = 2000;
const AGENT_SEND_WAIT_MAX_WAIT_MS = 10 * 60 * 1000;
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*m/g;

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
    opencode: 'OpenCode',
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

function resolveTailCount(raw: string | undefined, fallback = 20): number {
    const parsed = parseInt(raw ?? String(fallback), 10);
    return Number.isNaN(parsed) || parsed < 1 ? fallback : parsed;
}

function selectConversationMessages(
    conversation: ConversationMessage[],
    options: { full?: boolean; tail?: string },
): { displayMessages: ConversationMessage[]; isTruncated: boolean } {
    const tailCount = options.full ? conversation.length : resolveTailCount(options.tail);
    const displayMessages = conversation.slice(-tailCount);
    return {
        displayMessages,
        isTruncated: displayMessages.length < conversation.length,
    };
}

function renderConversationDetail(displayMessages: ConversationMessage[], totalMessages: number, isTruncated: boolean): void {
    const label = isTruncated
        ? `Conversation (last ${displayMessages.length} of ${totalMessages} messages)`
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
        ui.info(`Showing last ${displayMessages.length} of ${totalMessages} messages. Use --full to see all.`);
    }
}

function findSessionById(sessions: SessionSummary[], sessionId: string): SessionSummary | undefined | SessionSummary[] {
    const matches = sessions.filter((session) => session.sessionId === sessionId);
    if (matches.length === 0) return undefined;
    if (matches.length === 1) return matches[0];
    return matches;
}

function createAgentManager(): AgentManager {
    const manager = new AgentManager(AgentRegistry.default());
    manager.registerAdapter(new ClaudeCodeAdapter());
    manager.registerAdapter(new CodexAdapter());
    manager.registerAdapter(new GeminiCliAdapter());
    manager.registerAdapter(new OpenCodeAdapter());
    return manager;
}

const NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

function generateAgentName(cwd: string): string {
    const folder = path.basename(cwd)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'agent';
    return `${folder}-${Date.now().toString(36)}`;
}

function writeWaitStatus(message: string): void {
    process.stderr.write(`${message.replace(ANSI_ESCAPE_PATTERN, '')}\n`);
}

function parseSendWaitTimeout(value: string | undefined): { maxWaitMs: number; label?: string } {
    try {
        const parsed = parseMilliseconds(value, AGENT_SEND_WAIT_MAX_WAIT_MS);
        return { maxWaitMs: parsed.milliseconds, label: parsed.label };
    } catch (error) {
        throw new Error(`Invalid --timeout. ${(error as Error).message} Example: 30000.`);
    }
}

function readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
        let input = '';

        const cleanup = () => {
            process.stdin.off('data', onData);
            process.stdin.off('end', onEnd);
            process.stdin.off('error', onError);
        };
        const onData = (chunk: Buffer | string) => {
            input += chunk.toString();
        };
        const onEnd = () => {
            cleanup();
            resolve(input);
        };
        const onError = (error: Error) => {
            cleanup();
            reject(error);
        };

        process.stdin.setEncoding('utf8');
        process.stdin.on('data', onData);
        process.stdin.once('end', onEnd);
        process.stdin.once('error', onError);
    });
}

async function resolveSendMessage(message: string | undefined, options: { stdin?: boolean }): Promise<string> {
    if (message !== undefined && options.stdin) {
        throw new Error('Use either a message argument or --stdin, not both.');
    }

    if (options.stdin || (message === undefined && !process.stdin.isTTY)) {
        return readStdin();
    }

    if (message === undefined) {
        throw new Error('Message is required unless --stdin is used or stdin is piped.');
    }

    return message;
}

function prepareWaitMode(manager: AgentManager, agent: AgentInfo): {
    adapter: AgentAdapter;
    sessionFilePath: string;
    initialMessageCount: number;
} {
    if (!agent.sessionFilePath) {
        throw new Error(`No session file found for agent "${agent.name}"; cannot wait for response.`);
    }

    const adapter = manager.getAdapter(agent.type);
    if (!adapter) {
        throw new Error(`Unsupported agent type: ${agent.type}`);
    }

    return {
        adapter,
        sessionFilePath: agent.sessionFilePath,
        initialMessageCount: adapter.getConversation(agent.sessionFilePath, { verbose: false }).length,
    };
}

function toAgentSendWaitJson(result: Awaited<ReturnType<typeof waitForAgentResponse>>, agent: AgentInfo, prompt: string, targetId: string): object {
    return {
        target: {
            id: targetId,
            name: agent.name,
            type: agent.type,
            pid: agent.pid,
            status: agent.status,
            summary: agent.summary,
            projectPath: agent.projectPath,
            sessionId: agent.sessionId,
            sessionFilePath: result.sessionFilePath,
            lastActive: agent.lastActive,
        },
        prompt,
        responseMessages: result.messages,
        elapsedMs: result.elapsedMs,
        finalStatus: result.finalStatus,
    };
}

export function registerAgentCommand(program: Command): void {
    const agentCommand = program
        .command('agent')
        .description('Manage AI Agents');

    agentCommand
        .command('start')
        .description('Start a new agent in a managed tmux session')
        .requiredOption('--type <type>', `Agent type: ${Object.keys(AGENTS).join(', ')}`)
        .option('--name <name>', 'Human-readable name for the agent (lowercase alphanumeric + hyphens, 2-64 chars; default: {folder}-{timestamp})')
        .option('--cwd <path>', 'Working directory for the agent (default: current directory)')
        .action(withErrorHandler('start agent', async (options) => {
            const agentType = options.type as string;
            const cwd = path.resolve(options.cwd ?? process.cwd());
            const agentName = (options.name as string | undefined) ?? generateAgentName(cwd);

            if (!(agentType in AGENTS)) {
                ui.error(`Unsupported agent type "${agentType}". Supported: ${Object.keys(AGENTS).join(', ')}.`);
                process.exit(1);
            }
            if (!NAME_REGEX.test(agentName)) {
                ui.error(
                    `Invalid name "${agentName}". Use lowercase letters, digits, and hyphens only. ` +
                    'Must start and end with a letter or digit, 2–64 characters.'
                );
                process.exit(1);
            }
            if (!fs.existsSync(cwd)) {
                ui.error(`Directory "${cwd}" does not exist.`);
                process.exit(1);
            }

            try {
                const entry = await startAgent(
                    { type: agentType as StartableAgentType, name: agentName, cwd },
                    {
                        tmux: new TmuxManager(),
                        registry: AgentRegistry.default(),
                        onWarning: (msg) => ui.warning(msg),
                    },
                );
                ui.success(`Agent "${entry.name}" started (${entry.type}, PID ${entry.pid})`);
                ui.text(`Working directory: ${formatCwd(entry.cwd)}`);
                ui.text(`Attach: tmux attach -t ${entry.tmuxSession}`);
            } catch (err) {
                if (err instanceof TmuxUnavailableError) {
                    ui.error('tmux is not installed or not in PATH. Install it first (e.g., brew install tmux).');
                } else if (err instanceof AgentNameInUseError) {
                    ui.error(`Agent "${err.agentName}" is already running (PID ${err.pid}). Choose a different name.`);
                } else if (err instanceof AgentPidPollTimeoutError) {
                    ui.error(
                        `Agent process not found after ${err.timeoutMs / 1000}s. ` +
                        `Verify that "${err.command}" is in PATH inside the tmux environment.`
                    );
                } else {
                    throw err;
                }
                process.exit(1);
            }
        }));

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
                agent.projectPath ? path.basename(agent.projectPath) : '',
                formatType(agent.type),
                formatStatus(agent.status),
                formatWorkOn(agent.summary),
                formatRelativeTime(agent.lastActive)
            ]);

            ui.table({
                headers: ['Agent', 'Project', 'Type', 'Status', 'Working On', 'Active'],
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
        .command('sessions')
        .description('List historical Claude/Codex/Gemini/OpenCode sessions for resume')
        .option('--all', 'Include sessions from every cwd (default: only current cwd)')
        .option('--cwd <path>', 'Override the cwd filter (implies non-default scope)')
        .option('--type <type>', 'Filter to one of: claude, codex, gemini_cli, opencode')
        .option('--limit <n>', 'Max rows to print (default: 50; 0 = no limit)', '50')
        .option('-j, --json', 'Output as JSON')
        .action(withErrorHandler('list sessions', async (options) => {
            const opts = resolveListSessionsOptions(options);
            const manager = createAgentManager();
            let sessions = await manager.listSessions(opts.adapterOptions);

            const limit = parseLimit(options.limit);
            if (limit !== undefined) {
                sessions = sessions.slice(0, limit);
            }

            if (options.json) {
                console.log(JSON.stringify(sessions.map(toJsonSession), null, 2));
                return;
            }

            if (sessions.length === 0) {
                ui.info(opts.usedDefaultCwd
                    ? `No sessions found for ${formatCwd(opts.adapterOptions.cwd)}. Use --all to broaden.`
                    : 'No sessions found.');
                return;
            }

            ui.text('Sessions:', { breakline: true });
            ui.table({
                headers: ['Type', 'Session ID', 'CWD', 'First Message', 'Last Active'],
                rows: sessions.map((s) => [
                    formatType(s.type),
                    s.sessionId,
                    formatCwd(s.cwd),
                    formatFirstMessage(s.firstUserMessage),
                    formatRelativeTime(s.lastActive),
                ]),
                columnStyles: [
                    (text) => chalk.dim(text),
                    (text) => chalk.cyan(text),
                    (text) => chalk.dim(text),
                    (text) => text,
                    (text) => chalk.dim(text),
                ],
            });
        }));

    const sessionCommand = agentCommand
        .command('session')
        .description('Manage historical AI agent sessions');

    sessionCommand
        .command('detail')
        .description('Show detailed information about a historical session')
        .requiredOption('--id <sessionId>', 'Session ID (as shown in agent sessions)')
        .option('-j, --json', 'Output as JSON')
        .option('--type <type>', 'Filter to one of: claude, codex, gemini_cli, opencode')
        .option('--full', 'Show entire conversation history')
        .option('--tail <n>', 'Show last N messages (default: 20)', '20')
        .option('--verbose', 'Include tool call/result details')
        .action(withErrorHandler('get session detail', async (options) => {
            const manager = createAgentManager();
            const listOptions = resolveListSessionsOptions({ all: true, type: options.type }).adapterOptions;
            const sessions = await manager.listSessions(listOptions);
            const resolved = findSessionById(sessions, options.id);

            if (!resolved) {
                ui.error(`No session found matching "${options.id}".`);
                return;
            }

            if (Array.isArray(resolved)) {
                ui.error(`Multiple sessions match "${options.id}":`);
                resolved.forEach((session) => {
                    ui.text(`  - ${formatType(session.type)} ${formatCwd(session.cwd)}`);
                });
                ui.info('Use --type to choose the intended session source.');
                return;
            }

            const session = resolved;
            const adapter = manager.getAdapter(session.type);
            if (!adapter) {
                ui.error(`Unsupported agent type: ${session.type}`);
                return;
            }

            const conversation = adapter.getConversation(session.sessionFilePath, {
                verbose: options.verbose,
            });
            const { displayMessages, isTruncated } = selectConversationMessages(conversation, options);

            if (options.json) {
                const output = {
                    sessionId: session.sessionId,
                    cwd: session.cwd,
                    startTime: session.startedAt,
                    lastActive: session.lastActive,
                    type: session.type,
                    sessionFilePath: session.sessionFilePath,
                    conversation: displayMessages,
                };
                console.log(JSON.stringify(output, null, 2));
                return;
            }

            ui.text('Session Detail', { breakline: true });
            ui.text(chalk.dim('─'.repeat(40)));
            ui.text(`  ${chalk.bold('Session ID:')}  ${session.sessionId}`);
            ui.text(`  ${chalk.bold('CWD:')}         ${formatCwd(session.cwd)}`);
            ui.text(`  ${chalk.bold('Start Time:')}  ${session.startedAt.toLocaleString()}`);
            ui.text(`  ${chalk.bold('Last Active:')} ${formatRelativeTime(session.lastActive)}`);
            ui.text(`  ${chalk.bold('Type:')}        ${formatType(session.type)}`);
            ui.text(`  ${chalk.bold('File:')}        ${session.sessionFilePath}`);
            ui.breakline();
            renderConversationDetail(displayMessages, conversation.length, isTruncated);
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
        .command('send [message]')
        .description('Send a message to a running agent')
        .requiredOption('--id <identifier>', 'Agent name or partial match')
        .option('--stdin', 'Read the message from stdin')
        .option('--wait', 'Wait for and print the agent response')
        .option('--timeout <milliseconds>', 'Maximum time to wait with --wait, in milliseconds')
        .option('-j, --json', 'Output wait result as JSON')
        .action(withErrorHandler('send message', async (message, options) => {
            if (options.timeout !== undefined && !options.wait) {
                throw new Error('Use --timeout only with --wait.');
            }
            const waitTimeout = parseSendWaitTimeout(options.timeout);
            const prompt = await resolveSendMessage(message, options);
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

            if (![AgentStatus.WAITING, AgentStatus.IDLE].includes(agent.status)) {
                const warning = `Agent "${agent.name}" is not waiting for input (status: ${agent.status}). Sending anyway.`;
                if (options.wait) {
                    writeWaitStatus(warning);
                } else {
                    ui.warning(warning);
                }
            }

            const waitContext = options.wait ? prepareWaitMode(manager, agent) : undefined;

            const focusManager = new TerminalFocusManager();
            const location = await focusManager.findTerminal(agent.pid);
            if (!location) {
                if (options.wait) {
                    throw new Error(`Cannot find terminal for agent "${agent.name}" (PID: ${agent.pid}).`);
                }
                ui.error(`Cannot find terminal for agent "${agent.name}" (PID: ${agent.pid}).`);
                return;
            }

            await TtyWriter.send(location, prompt);

            if (!options.wait) {
                ui.success(`Sent message to ${agent.name}.`);
                return;
            }

            if (!waitContext) {
                throw new Error('Wait mode was not prepared.');
            }

            const waitResult = await waitForAgentResponse({
                manager,
                adapter: waitContext.adapter,
                target: {
                    id: options.id,
                    name: agent.name,
                    type: agent.type,
                    pid: agent.pid,
                    sessionId: agent.sessionId,
                    sessionFilePath: waitContext.sessionFilePath,
                },
                initialMessageCount: waitContext.initialMessageCount,
                options: {
                    pollIntervalMs: AGENT_SEND_WAIT_POLL_INTERVAL_MS,
                    maxWaitMs: waitTimeout.maxWaitMs,
                    timeoutLabel: waitTimeout.label,
                },
                onAssistantMessage: (msg) => {
                    if (options.json) return;
                    process.stdout.write(`${msg.content}\n`);
                },
                onStatus: writeWaitStatus,
            });

            if (options.json) {
                console.log(JSON.stringify(toAgentSendWaitJson(waitResult, agent, prompt, options.id), null, 2));
            }
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

            const { displayMessages, isTruncated } = selectConversationMessages(conversation, options);

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
            renderConversationDetail(displayMessages, conversation.length, isTruncated);
        }));

    agentCommand
        .command('rename <current-name> <new-name>')
        .description('Rename an agent in the registry')
        .action(withErrorHandler('rename agent', async (currentName: string, newName: string) => {
            if (!NAME_REGEX.test(newName)) {
                ui.error(
                    `Invalid name "${newName}". Use lowercase letters, digits, and hyphens only. ` +
                    'Must start and end with a letter or digit, 2–64 characters.'
                );
                process.exit(1);
                return;
            }

            if (currentName === newName) {
                ui.info(`Agent "${currentName}" already has that name.`);
                return;
            }

            try {
                AgentRegistry.default().rename(currentName, newName);
                ui.success(`Agent "${currentName}" renamed to "${newName}".`);
            } catch (err) {
                if (err instanceof RenameNotFoundError) {
                    ui.error(err.message);
                } else if (err instanceof RenameConflictError) {
                    ui.error(`Agent "${err.agentName}" is already in use. Choose a different name.`);
                } else {
                    throw err;
                }
                process.exit(1);
            }
        }));

    agentCommand
        .command('console')
        .description('Interactive multi-agent console (open, message, monitor)')
        .action(withErrorHandler('agent console', async () => {
            if (!process.stdout.isTTY) {
                ui.error('agent console requires an interactive terminal (TTY).');
                process.exit(1);
            }
            const manager = createAgentManager();
            const { waitUntilExit } = render(
                createElement(ConsoleApp, { manager }),
                { alternateScreen: true, exitOnCtrlC: true },
            );
            await waitUntilExit();
        }));
}
