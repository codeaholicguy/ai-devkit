import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
    AgentManager,
    ClaudeCodeAdapter,
    CodexAdapter,
    GeminiCliAdapter,
    TerminalFocusManager,
    TtyWriter,
    type AgentAdapter,
    type AgentInfo,
    type TerminalLocation,
} from '@ai-devkit/agent-manager';
import { Telegraf } from 'telegraf';
import {
    ChannelManager,
    TelegramAdapter,
    TELEGRAM_CHANNEL_TYPE,
    ConfigStore,
    type ChannelEntry,
    type TelegramConfig,
} from '@ai-devkit/channel-connector';
import { ui } from '../util/terminal-ui';
import { withErrorHandler } from '../util/errors';
import { getErrorMessage } from '../util/text';
import { createLogger, enableDebug } from '../util/debug';

const debug = createLogger('channel');
const AGENT_POLL_INTERVAL_MS = 2000;

function createAgentManager(): AgentManager {
    const manager = new AgentManager();
    manager.registerAdapter(new ClaudeCodeAdapter());
    manager.registerAdapter(new CodexAdapter());
    manager.registerAdapter(new GeminiCliAdapter());
    return manager;
}

async function resolveTargetAgent(agentManager: AgentManager, agentName: string): Promise<AgentInfo | null> {
    const agents = await agentManager.listAgents();

    if (agents.length === 0) {
        ui.error('No running agents detected.');
        return null;
    }

    const resolved = agentManager.resolveAgent(agentName, agents);
    if (!resolved) {
        ui.error(`No agent found matching "${agentName}".`);
        ui.info('Available agents:');
        agents.forEach(a => ui.text(`  - ${a.name}`));
        return null;
    }

    if (Array.isArray(resolved)) {
        const { selectedAgent } = await inquirer.prompt([{
            type: 'list',
            name: 'selectedAgent',
            message: 'Multiple agents match. Select one:',
            choices: resolved.map(a => ({
                name: `${a.name} (PID: ${a.pid})`,
                value: a,
            })),
        }]);
        return selectedAgent;
    }

    return resolved as AgentInfo;
}

function setupInputHandler(
    telegram: TelegramAdapter,
    terminalLocation: TerminalLocation,
    chatIdRef: { value: string | null },
): void {
    telegram.onMessage(async (msg) => {
        debug(`Received message from chat ID: ${msg.chatId}, text length: ${msg.text?.length ?? 0}`);

        if (!chatIdRef.value) {
            chatIdRef.value = msg.chatId;
            ui.info(`Authorized Telegram user (chat ID: ${msg.chatId})`);
        }

        if (msg.chatId !== chatIdRef.value) {
            debug(`Rejected message from unauthorized chat ID: ${msg.chatId}`);
            await telegram.sendMessage(msg.chatId, 'Unauthorized. Only the first user is allowed.');
            return;
        }

        try {
            await TtyWriter.send(terminalLocation, msg.text);
            debug(`Sent message to agent terminal (length: ${msg.text?.length ?? 0})`);
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            ui.error(`Failed to send to agent: ${message}`);
            await telegram.sendMessage(msg.chatId, `Failed to send to agent: ${message}`);
        }
    });
}

function startOutputPolling(
    telegram: TelegramAdapter,
    agentAdapter: AgentAdapter,
    agent: AgentInfo,
    chatIdRef: { value: string | null },
): NodeJS.Timeout {
    let lastMessageCount = 0;

    if (agent.sessionFilePath) {
        try {
            const existing = agentAdapter.getConversation(agent.sessionFilePath);
            lastMessageCount = existing.length;
        } catch {
            // Session file might not exist yet
        }
    }

    return setInterval(async () => {
        if (!chatIdRef.value || !agent.sessionFilePath) return;

        try {
            const conversation = agentAdapter.getConversation(agent.sessionFilePath);
            const newMessages = conversation.slice(lastMessageCount);
            lastMessageCount = conversation.length;

            if (newMessages.length > 0) {
                debug(`Polled ${newMessages.length} new message(s) from agent conversation`);
            }

            for (const msg of newMessages) {
                if (msg.role !== 'user' && msg.content) {
                    await telegram.sendMessage(chatIdRef.value, msg.content);
                    debug(`Sent agent response to Telegram (role: ${msg.role}, length: ${msg.content.length})`);
                }
            }
        } catch {
            // Agent may have terminated — check later
        }
    }, AGENT_POLL_INTERVAL_MS);
}

function setupGracefulShutdown(manager: ChannelManager, pollInterval: NodeJS.Timeout): void {
    const shutdown = async () => {
        debug('Shutdown signal received');
        ui.info('\nShutting down...');
        clearInterval(pollInterval);
        debug('Output polling stopped');
        await manager.stopAll();
        debug('ChannelManager stopped');
        ui.success('Channel bridge stopped.');
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

export function registerChannelCommand(program: Command): void {
    const channelCommand = program
        .command('channel')
        .description('Connect agents with messaging channels');

    channelCommand
        .command('connect <type>')
        .description('Connect a messaging channel (e.g., telegram)')
        .action(withErrorHandler('connect channel', async (type: string) => {
            if (type !== TELEGRAM_CHANNEL_TYPE) {
                ui.error(`Unsupported channel type: ${type}. Supported: ${TELEGRAM_CHANNEL_TYPE}`);
                return;
            }

            const configStore = new ConfigStore();
            const existing = await configStore.getChannel(TELEGRAM_CHANNEL_TYPE);
            if (existing) {
                const { overwrite } = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'overwrite',
                    message: 'Telegram is already configured. Overwrite?',
                    default: false,
                }]);
                if (!overwrite) return;
            }

            ui.info('To connect Telegram, you need a bot token from @BotFather.');
            ui.info('Open Telegram, search for @BotFather, and create a new bot.\n');

            const { botToken } = await inquirer.prompt([{
                type: 'password',
                name: 'botToken',
                message: 'Enter your Telegram bot token:',
                validate: (input: string) => {
                    if (!input.trim()) return 'Bot token is required';
                    if (!input.includes(':')) return 'Invalid token format (expected number:hash)';
                    return true;
                },
            }]);

            const spinner = ui.spinner('Validating bot token...');
            spinner.start();

            let botUsername: string;
            try {
                const bot = new Telegraf(botToken.trim());
                const me = await bot.telegram.getMe();
                botUsername = me.username;
                spinner.succeed(`Connected to bot @${botUsername}`);
            } catch (error: unknown) {
                spinner.fail('Invalid bot token. Please check and try again.');
                return;
            }

            const entry: ChannelEntry = {
                type: TELEGRAM_CHANNEL_TYPE,
                enabled: true,
                createdAt: new Date().toISOString(),
                config: {
                    botToken: botToken.trim(),
                    botUsername,
                } as TelegramConfig,
            };

            await configStore.saveChannel(TELEGRAM_CHANNEL_TYPE, entry);
            ui.success('Telegram channel configured successfully!');
            ui.info(`Bot: @${botUsername}`);
            ui.info('Run "ai-devkit channel start --agent <name>" to start the bridge.');
        }));

    channelCommand
        .command('list')
        .description('List configured channels')
        .action(withErrorHandler('list channels', async () => {
            const configStore = new ConfigStore();
            const config = await configStore.getConfig();
            const channels = Object.entries(config.channels);

            if (channels.length === 0) {
                ui.info('No channels configured. Run "ai-devkit channel connect telegram" to set up.');
                return;
            }

            ui.text('Configured Channels:', { breakline: true });

            const rows = channels.map(([name, entry]) => {
                const telegramConfig = entry.config as TelegramConfig;
                return [
                    name,
                    entry.type,
                    entry.enabled ? chalk.green('enabled') : chalk.dim('disabled'),
                    telegramConfig.botUsername ? `@${telegramConfig.botUsername}` : '-',
                    entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '-',
                ];
            });

            ui.table({
                headers: ['Name', 'Type', 'Status', 'Bot', 'Created'],
                rows,
            });
        }));

    channelCommand
        .command('disconnect <type>')
        .description('Remove a channel configuration')
        .action(withErrorHandler('disconnect channel', async (type: string) => {
            const configStore = new ConfigStore();
            const existing = await configStore.getChannel(type);

            if (!existing) {
                ui.info(`No ${type} channel configured.`);
                return;
            }

            const { confirm } = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: `Remove ${type} channel configuration?`,
                default: false,
            }]);

            if (!confirm) return;

            await configStore.removeChannel(type);
            ui.success(`${type} channel disconnected.`);
        }));

    channelCommand
        .command('start')
        .description('Start the channel bridge to a running agent')
        .requiredOption('--agent <name>', 'Name of the agent to bridge')
        .option('--debug', 'Enable debug logging')
        .action(withErrorHandler('start channel bridge', async (options) => {
            if (options.debug) {
                enableDebug();
            }

            debug(`Starting channel bridge: agent=${options.agent}`);

            const configStore = new ConfigStore();
            debug('Loading channel configuration from ConfigStore');
            const channelEntry = await configStore.getChannel(TELEGRAM_CHANNEL_TYPE);

            if (!channelEntry) {
                ui.error('No Telegram channel configured. Run "ai-devkit channel connect telegram" first.');
                return;
            }

            const telegramConfig = channelEntry.config as TelegramConfig;
            debug(`Telegram channel found: bot=@${telegramConfig.botUsername}`);

            debug(`Resolving agent: "${options.agent}"`);
            const agentManager = createAgentManager();
            const agent = await resolveTargetAgent(agentManager, options.agent);
            if (!agent) return;

            debug(`Agent resolved: name=${agent.name}, type=${agent.type}, pid=${agent.pid}`);
            debug(`Agent session file: ${agent.sessionFilePath ?? 'none'}`);

            const agentAdapter = agentManager.getAdapter(agent.type);
            if (!agentAdapter) {
                ui.error(`Unsupported agent type: ${agent.type}`);
                return;
            }

            debug(`Agent adapter loaded for type: ${agent.type}`);

            debug(`Looking up terminal for PID: ${agent.pid}`);
            const focusManager = new TerminalFocusManager();
            const terminalLocation = await focusManager.findTerminal(agent.pid);

            if (!terminalLocation) {
                ui.error(`Cannot find terminal for agent "${agent.name}" (PID: ${agent.pid}).`);
                return;
            }

            debug(`Terminal found: ${JSON.stringify(terminalLocation)}`);

            const telegram = new TelegramAdapter({ botToken: telegramConfig.botToken });
            const chatIdRef = { value: null as string | null };

            setupInputHandler(telegram, terminalLocation, chatIdRef);
            debug(`Starting output polling (interval: ${AGENT_POLL_INTERVAL_MS}ms)`);
            const pollInterval = startOutputPolling(telegram, agentAdapter, agent, chatIdRef);

            const manager = new ChannelManager();
            manager.registerAdapter(telegram);
            setupGracefulShutdown(manager, pollInterval);

            ui.success(`Bridge started: Telegram @${telegramConfig.botUsername} <-> Agent "${agent.name}" (PID: ${agent.pid})`);
            ui.info('Send a message to your Telegram bot to start chatting.');
            ui.info('Press Ctrl+C to stop.\n');

            debug('Calling manager.startAll()');
            await manager.startAll();
            debug('ChannelManager started successfully');

            await new Promise(() => {});
        }));

    channelCommand
        .command('status')
        .description('Show channel bridge status')
        .action(async () => {
            const configStore = new ConfigStore();
            const config = await configStore.getConfig();
            const channels = Object.entries(config.channels);

            if (channels.length === 0) {
                ui.info('No channels configured.');
                return;
            }

            for (const [name, entry] of channels) {
                const telegramConfig = entry.config as TelegramConfig;
                ui.text(`${chalk.bold(name)} (${entry.type})`);
                ui.text(`  Enabled: ${entry.enabled ? chalk.green('yes') : chalk.red('no')}`);
                ui.text(`  Bot: @${telegramConfig.botUsername || 'unknown'}`);
                ui.text(`  Configured: ${entry.createdAt || 'unknown'}`);
                ui.breakline();
            }
        });
}
