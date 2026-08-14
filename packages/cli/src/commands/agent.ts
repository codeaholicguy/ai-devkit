import os from 'os';
import path from 'path';
import { createElement } from 'react';
import { Command } from 'commander';
import chalk from 'chalk';
import { render } from 'ink';
import {
    ClaudePrintAgentService,
    PrintAgentStore,
    AgentStatus,
    AGENTS,
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
    createAgentActionService,
    createAgentManager,
} from '../services/agent/agent-action.service.js';
import type { ApplicationActionResult } from '../services/actions/action-result.js';
import { registerAgentGroupCommand } from './agent/group.command.js';
import { AGENT_CONSOLE_RENDER_OPTIONS, ConsoleApp } from '../tui/console/ConsoleApp.js';
import { generateAgentName } from '../util/agent.js';

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
    copilot: 'Copilot',
    gemini_cli: 'Gemini CLI',
    grok_cli: 'Grok CLI',
    opencode: 'OpenCode',
    pi: 'Pi',
    other: 'Other',
};

const AGENT_MODES = {
    INTERACTIVE: 'interactive',
    DURABLE: 'durable',
} as const;

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

function createPrintAgentService(): ClaudePrintAgentService {
    return new ClaudePrintAgentService({ store: new PrintAgentStore() });
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

function applyActionExit(result: ApplicationActionResult): void {
    if (result.cliExitCode !== undefined) process.exit(result.cliExitCode);
}

export function registerAgentCommand(program: Command): void {
    const agentCommand = program
        .command('agent')
        .description('Manage AI Agents');

    agentCommand
        .command('start')
        .description('Start a new agent in a managed tmux session')
        .requiredOption('--type <type>', `Agent type: ${Object.keys(AGENTS).join(', ')}`)
        .option('--mode <mode>', 'Agent mode: interactive or print', 'interactive')
        .option('--name <name>', 'Human-readable name for the agent (lowercase alphanumeric + hyphens, 2-64 chars; default: {folder}-{timestamp})')
        .option('--cwd <path>', 'Working directory for the agent (default: current directory)')
        .option('--debug', 'Enable debug logging')
        .action(withErrorHandler('start agent', async (options) => {
            const agentType = options.type as string;
            const mode = options.mode as string;
            const cwd = path.resolve(options.cwd ?? process.cwd());
            const agentName = (options.name as string | undefined) ?? generateAgentName(cwd);
            const result = await createAgentActionService().start({
                agentType,
                mode,
                name: agentName,
                cwd,
                debug: options.debug,
            });
            applyActionExit(result);
        }));

    agentCommand
        .command('list')
        .description('List all running AI agents')
        .option('-j, --json', 'Output as JSON')
        .action(withErrorHandler('list agents', async (options) => {
            const manager = createAgentManager();
            const agents = await manager.listAgents();
            const printAgents = await createPrintAgentService().store.list();

            if (options.json) {
                const output = [
                    ...agents.map(agent => ({ ...agent, mode: AGENT_MODES.INTERACTIVE })),
                    ...printAgents.map(agent => ({ ...agent, mode: AGENT_MODES.DURABLE })),
                ];
                console.log(JSON.stringify(output, null, 2));
                return;
            }

            if (agents.length === 0 && printAgents.length === 0) {
                ui.info('No running agents detected.');
                return;
            }

            ui.text('Agents:', { breakline: true });

            const rows = [...agents.map(agent => [
                agent.name,
                agent.projectPath ? path.basename(agent.projectPath) : '',
                formatType(agent.type),
                AGENT_MODES.INTERACTIVE,
                formatStatus(agent.status),
                formatWorkOn(agent.summary),
                formatRelativeTime(agent.lastActive),
            ]), ...printAgents.map(agent => [
                agent.name,
                path.basename(agent.cwd),
                formatType(agent.provider),
                AGENT_MODES.DURABLE,
                agent.state,
                agent.lastResult?.summary ?? agent.sessionHealth,
                agent.lastActiveAt ? formatRelativeTime(new Date(agent.lastActiveAt)) : 'never',
            ])];

            ui.table({
                headers: ['Agent', 'Project', 'Type', 'Mode', 'Status', 'Working On', 'Active'],
                rows: rows,
                maxWidth: process.stdout.columns ?? 120,
                columnStyles: [
                    (text) => chalk.cyan(text),
                    (text) => chalk.dim(text),
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
        .description('List historical Claude/Codex/Gemini/Grok/OpenCode sessions for resume')
        .option('--all', 'Include sessions from every cwd (default: only current cwd)')
        .option('--cwd <path>', 'Override the cwd filter (implies non-default scope)')
        .option('--type <type>', 'Filter to one of: claude, codex, gemini_cli, grok_cli, opencode, copilot, pi')
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

    registerAgentGroupCommand(agentCommand);

    const sessionCommand = agentCommand
        .command('session')
        .description('Manage historical AI agent sessions');

    sessionCommand
        .command('detail')
        .description('Show detailed information about a historical session')
        .requiredOption('--id <sessionId>', 'Session ID (as shown in agent sessions)')
        .option('-j, --json', 'Output as JSON')
        .option('--type <type>', 'Filter to one of: claude, codex, gemini_cli, grok_cli, opencode, copilot, pi')
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
        .option('--debug', 'Trace how the agent terminal is resolved and focused')
        .action(withErrorHandler('open agent', async (name, options) => {
            const result = await createAgentActionService().open({ agentName: name, debug: options.debug });
            applyActionExit(result);
        }));

    agentCommand
        .command('send [message]')
        .description('Send a message to a running agent')
        .option('--id <identifier>', 'Agent name or partial match')
        .option('--group <name>', 'Agent group name')
        .option('--stdin', 'Read the message from stdin')
        .option('--wait', 'Wait for and print the agent response')
        .option('--timeout <milliseconds>', 'Maximum time to wait with --wait, in milliseconds')
        .option('-j, --json', 'Output wait result as JSON')
        .action(withErrorHandler('send message', async (message, options) => {
            const prompt = await resolveSendMessage(message, options);
            const result = await createAgentActionService().send({
                agentName: options.id,
                groupName: options.group,
                message: prompt,
                wait: options.wait,
                timeout: options.timeout,
                json: options.json,
            });
            applyActionExit(result);
        }));

    agentCommand
        .command('kill <name>')
        .description('Stop a running agent and clean up its managed tmux session')
        .action(withErrorHandler('kill agent', async (name: string) => {
            const result = await createAgentActionService().kill({ agentName: name });
            applyActionExit(result);
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
            const printResolved = await createPrintAgentService().store.resolve(options.id);
            if (Array.isArray(printResolved)) {
                throw new Error(`Multiple print agents match "${options.id}".`);
            }
            if (printResolved) {
                const liveExact = agents.filter((agent) => agent.name.toLowerCase() === String(options.id).toLowerCase());
                if (options.id !== printResolved.id && liveExact.length > 0) {
                    throw new Error(`Agent name "${options.id}" is ambiguous across interactive and print modes. Use the print agent ID.`);
                }
                if (options.json) {
                    console.log(JSON.stringify(printResolved, null, 2));
                    return;
                }
                ui.text('Print Agent Detail', { breakline: true });
                ui.text(chalk.dim('─'.repeat(40)));
                ui.text(`  ${chalk.bold('Agent ID:')}    ${printResolved.id}`);
                ui.text(`  ${chalk.bold('Session ID:')}  ${printResolved.providerSessionId}`);
                ui.text(`  ${chalk.bold('Name:')}        ${printResolved.name}`);
                ui.text(`  ${chalk.bold('Provider:')}    Claude Code`);
                ui.text(`  ${chalk.bold('Mode:')}        print`);
                ui.text(`  ${chalk.bold('CWD:')}         ${formatCwd(printResolved.cwd)}`);
                ui.text(`  ${chalk.bold('State:')}       ${printResolved.state}`);
                ui.text(`  ${chalk.bold('Session:')}     ${printResolved.sessionHealth}`);
                ui.text(`  ${chalk.bold('Last Active:')} ${printResolved.lastActiveAt ? formatRelativeTime(new Date(printResolved.lastActiveAt)) : 'never'}`);
                if (printResolved.lastResult) ui.text(`  ${chalk.bold('Last Result:')} ${printResolved.lastResult.summary}`);
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
            const result = await createAgentActionService().rename({ currentName, newName });
            applyActionExit(result);
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
                AGENT_CONSOLE_RENDER_OPTIONS,
            );
            await waitUntilExit();
        }));
}
