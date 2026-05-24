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
import { ChannelService } from '../services/channel/channel.service';

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
    onAuthorize?: (chatId: string) => Promise<void>,
): void {
    telegram.onMessage(async (msg) => {
        debug(`Received message from chat ID: ${msg.chatId}, text length: ${msg.text?.length ?? 0}`);

        if (!chatIdRef.value) {
            chatIdRef.value = msg.chatId;
            await onAuthorize?.(msg.chatId);
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

export function startOutputPolling(
    telegram: TelegramAdapter,
    agentAdapter: AgentAdapter,
    agent: AgentInfo,
    chatIdRef: { value: string | null },
): NodeJS.Timeout {
    let lastMessageCount = 0;

    debug(`startOutputPolling: sessionFilePath=${agent.sessionFilePath ?? 'null'}`);

    if (agent.sessionFilePath) {
        try {
            const existing = agentAdapter.getConversation(agent.sessionFilePath);
            lastMessageCount = existing.length;
            debug(`Initial conversation length: ${lastMessageCount}`);
        } catch (error: unknown) {
            debug(`Initial getConversation threw: ${getErrorMessage(error)}`);
        }
    }

    let tickCount = 0;
    let lastReportedLength = lastMessageCount;

    return setInterval(async () => {
        tickCount += 1;

        if (!chatIdRef.value) {
            if (tickCount % 15 === 1) {
                debug(`poll skip: no authorized chat yet (tick ${tickCount})`);
            }
            return;
        }
        if (!agent.sessionFilePath) {
            if (tickCount % 15 === 1) {
                debug(`poll skip: agent has no sessionFilePath (tick ${tickCount})`);
            }
            return;
        }

        let newMessages;
        try {
            const conversation = agentAdapter.getConversation(agent.sessionFilePath);
            newMessages = conversation.slice(lastMessageCount);
            if (conversation.length !== lastReportedLength) {
                debug(`Conversation length changed: ${lastReportedLength} -> ${conversation.length} (lastMessageCount=${lastMessageCount}, new=${newMessages.length})`);
                lastReportedLength = conversation.length;
            }
            lastMessageCount = conversation.length;
        } catch (error: unknown) {
            debug(`getConversation threw: ${getErrorMessage(error)}`);
            return;
        }

        if (newMessages.length > 0) {
            debug(`Polled ${newMessages.length} new message(s) from agent conversation`);
        }

        for (const msg of newMessages) {
            const contentType = typeof msg.content;
            const contentLen = msg.content ? String(msg.content).length : 0;
            debug(`message: role=${msg.role}, contentType=${contentType}, length=${contentLen}`);

            if (msg.role === 'user' || !msg.content) {
                debug(`skipping message (role=${msg.role}, hasContent=${Boolean(msg.content)})`);
                continue;
            }

            try {
                await telegram.sendMessage(chatIdRef.value, msg.content);
                debug(`Sent agent response to Telegram (role: ${msg.role}, length: ${contentLen})`);
            } catch (error: unknown) {
                const message = getErrorMessage(error);
                ui.error(`Failed to send agent response to Telegram: ${message}`);
                debug(`sendMessage failed: ${message}`);
            }
        }
    }, AGENT_POLL_INTERVAL_MS);
}

function setupGracefulShutdown(
    manager: ChannelManager,
    pollInterval: NodeJS.Timeout,
    channelService: ChannelService,
    channelName: string,
): void {
    const shutdown = async () => {
        debug('Shutdown signal received');
        ui.info('\nShutting down...');
        clearInterval(pollInterval);
        debug('Output polling stopped');
        await manager.stopAll();
        debug('ChannelManager stopped');
        await channelService.unregisterBridge(channelName);
        debug(`Removed channel bridge entry: ${channelName}`);
        ui.success('Channel bridge stopped.');
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

export function registerChannelCommand(program: Command): void {
    const channelService = new ChannelService();
    const channelCommand = program
        .command('channel')
        .description('Connect agents with messaging channels');

    channelCommand
        .command('connect <type>')
        .description('Connect a messaging channel (e.g., telegram)')
        .option('--name <name>', 'Channel instance name')
        .action(withErrorHandler('connect channel', async (type: string, options: { name?: string }) => {
            if (type !== TELEGRAM_CHANNEL_TYPE) {
                ui.error(`Unsupported channel type: ${type}. Supported: ${TELEGRAM_CHANNEL_TYPE}`);
                return;
            }

            const channelName = channelService.resolveConnectChannelName(options.name);
            const configStore = new ConfigStore();
            const existing = await configStore.getChannel(channelName);

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

            const trimmedBotToken = botToken.trim();
            const config = await configStore.getConfig();
            channelService.assertUniqueTelegramToken(config, channelName, trimmedBotToken);

            const entry: ChannelEntry = {
                type: TELEGRAM_CHANNEL_TYPE,
                enabled: true,
                createdAt: existing?.createdAt ?? new Date().toISOString(),
                config: {
                    botToken: trimmedBotToken,
                    botUsername,
                    authorizedChatId: (existing?.config as TelegramConfig | undefined)?.botToken === trimmedBotToken
                        ? (existing?.config as TelegramConfig).authorizedChatId
                        : undefined,
                } as TelegramConfig,
            };

            await configStore.saveChannel(channelName, entry);
            ui.success(`Telegram channel "${channelName}" configured successfully!`);
            ui.info(`Bot: @${botUsername}`);
            ui.info(`Run "ai-devkit channel start ${channelName} --agent <name>" to start the bridge.`);
        }));

    channelCommand
        .command('list')
        .description('List configured channels')
        .action(withErrorHandler('list channels', async () => {
            const configStore = new ConfigStore();
            const config = await configStore.getConfig();
            const channels = Object.entries(config.channels);
            const liveBridges = await channelService.getLiveBridges();
            const liveByChannel = new Map(liveBridges.map(bridge => [bridge.channelName, bridge]));

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
                    telegramConfig.authorizedChatId ? 'yes' : 'no',
                    liveByChannel.has(name) ? chalk.green('running') : chalk.dim('stopped'),
                    entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '-',
                ];
            });

            ui.table({
                headers: ['Name', 'Type', 'Status', 'Bot', 'Authorized', 'Bridge', 'Created'],
                rows,
            });
        }));

    channelCommand
        .command('disconnect <name>')
        .description('Remove a channel configuration')
        .action(withErrorHandler('disconnect channel', async (name: string) => {
            const channelName = channelService.resolveConnectChannelName(name);
            const configStore = new ConfigStore();
            const existing = await configStore.getChannel(channelName);

            if (!existing) {
                ui.info(`No channel configured with name "${channelName}".`);
                return;
            }

            const { confirm } = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: `Remove "${channelName}" channel configuration?`,
                default: false,
            }]);

            if (!confirm) return;

            await configStore.removeChannel(channelName);
            ui.success(`${channelName} channel disconnected.`);
        }));

    channelCommand
        .command('start [name]')
        .description('Start the channel bridge to a running agent')
        .requiredOption('--agent <name>', 'Name of the agent to bridge')
        .option('--debug', 'Enable debug logging')
        .action(withErrorHandler('start channel bridge', async (name: string | undefined, options) => {
            if (options.debug) {
                enableDebug();
            }

            const configStore = new ConfigStore();
            debug('Loading channel configuration from ConfigStore');
            const config = await configStore.getConfig();
            const channelName = channelService.resolveStartChannelName(config, name);
            debug(`Starting channel bridge: channel=${channelName}, agent=${options.agent}`);
            const channelEntry = config.channels[channelName];
            const runningBridge = await channelService.getLiveBridgeByChannel(channelName);

            if (!channelEntry) {
                ui.error(`No channel configured with name "${channelName}".`);
                const availableChannels = Object.keys(config.channels);
                if (availableChannels.length > 0) {
                    ui.info(`Available channels: ${availableChannels.join(', ')}`);
                }
                return;
            }
            if (runningBridge) {
                ui.error(`Channel "${channelName}" bridge is already running (PID: ${runningBridge.bridgePid}).`);
                return;
            }

            const telegramConfig = channelEntry.config as TelegramConfig;
            debug(`Telegram channel "${channelName}" found: bot=@${telegramConfig.botUsername}`);

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
            const chatIdRef = {
                value: telegramConfig.authorizedChatId !== undefined
                    ? String(telegramConfig.authorizedChatId)
                    : null,
            };

            setupInputHandler(telegram, terminalLocation, chatIdRef, async (chatId) => {
                const latest = await configStore.getChannel(channelName);
                if (!latest) return;
                const latestTelegramConfig = latest.config as TelegramConfig;
                await configStore.saveChannel(channelName, {
                    ...latest,
                    config: {
                        ...latestTelegramConfig,
                        authorizedChatId: Number(chatId),
                    },
                });
            });
            debug(`Starting output polling (interval: ${AGENT_POLL_INTERVAL_MS}ms)`);
            const pollInterval = startOutputPolling(telegram, agentAdapter, agent, chatIdRef);

            const manager = new ChannelManager();
            manager.registerAdapter(telegram);
            setupGracefulShutdown(manager, pollInterval, channelService, channelName);

            ui.success(`Bridge started: ${channelName} (@${telegramConfig.botUsername}) <-> Agent "${agent.name}" (PID: ${agent.pid})`);
            ui.info('Send a message to your Telegram bot to start chatting.');
            ui.info('Press Ctrl+C to stop.\n');

            await channelService.registerBridge({
                channelName,
                channelType: TELEGRAM_CHANNEL_TYPE,
                agentName: agent.name,
                agentPid: agent.pid,
                bridgePid: process.pid,
                startedAt: new Date().toISOString(),
            });
            debug(`Registered channel bridge entry: ${channelName}`);

            try {
                debug('Calling manager.startAll()');
                await manager.startAll();
                debug('ChannelManager started successfully');
            } catch (error) {
                await channelService.unregisterBridge(channelName);
                throw error;
            }

            await new Promise(() => {});
        }));

    channelCommand
        .command('status [name]')
        .description('Show channel bridge status')
        .action(withErrorHandler('channel status', async (name: string | undefined) => {
            const configStore = new ConfigStore();
            const config = await configStore.getConfig();
            const channelFilter = name ? channelService.resolveConnectChannelName(name) : undefined;
            const channels = Object.entries(config.channels)
                .filter(([channelName]) => !channelFilter || channelName === channelFilter);
            const liveBridges = await channelService.getLiveBridges();
            const liveByChannel = new Map(liveBridges.map(bridge => [bridge.channelName, bridge]));

            if (channels.length === 0) {
                ui.info(channelFilter ? `No channel configured with name "${channelFilter}".` : 'No channels configured.');
                return;
            }

            for (const [name, entry] of channels) {
                const telegramConfig = entry.config as TelegramConfig;
                const bridge = liveByChannel.get(name);
                ui.text(`${chalk.bold(name)} (${entry.type})`);
                ui.text(`  Enabled: ${entry.enabled ? chalk.green('yes') : chalk.red('no')}`);
                ui.text(`  Bot: @${telegramConfig.botUsername || 'unknown'}`);
                ui.text(`  Authorized: ${telegramConfig.authorizedChatId ? 'yes' : 'no'}`);
                ui.text(`  Bridge: ${bridge ? chalk.green(`running (PID: ${bridge.bridgePid}, agent: ${bridge.agentName})`) : chalk.dim('stopped')}`);
                ui.text(`  Configured: ${entry.createdAt || 'unknown'}`);
                ui.breakline();
            }
        }));
}
