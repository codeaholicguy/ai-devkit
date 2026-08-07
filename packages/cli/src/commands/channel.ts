import * as path from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import chalk from 'chalk';
import { Telegraf } from 'telegraf';
import {
    TELEGRAM_CHANNEL_TYPE,
    SLACK_CHANNEL_TYPE,
    validateSlackAppToken,
    validateSlackCredentials,
    ConfigStore,
    type ChannelEntry,
    type SlackConfig,
    type TelegramConfig,
} from '@ai-devkit/channel-connector';
import { ui } from '../util/terminal-ui.js';
import { withErrorHandler } from '../util/errors.js';
import { createLogger, enableDebug } from '../util/debug.js';
import { getErrorMessage } from '../util/text.js';
import { confirm, password } from '@inquirer/prompts';
import { ChannelService } from '../services/channel/channel.service.js';
import { runChannelBridge } from '../services/channel/channel-runner.js';

const debug = createLogger('channel');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDaemonLaunch(): { command: string; args: string[] } {
    if (path.extname(__filename) === '.ts') {
        return {
            command: process.execPath,
            args: [
                '--no-warnings',
                '--loader',
                'ts-node/esm',
                path.resolve(__dirname, '..', 'channel-daemon.ts'),
            ],
        };
    }

    return {
        command: process.execPath,
        args: [path.resolve(__dirname, '..', 'channel-daemon.js')],
    };
}

function redactSecrets(message: string, secrets: string[]): string {
    return secrets.reduce(
        (redacted, secret) => secret ? redacted.split(secret).join('[REDACTED]') : redacted,
        message,
    );
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
        .option('--debug', 'Enable debug logging')
        .action(withErrorHandler('connect channel', async (type: string, options: { name?: string; debug?: boolean }) => {
            if (options.debug) {
                enableDebug();
            }
            if (type !== TELEGRAM_CHANNEL_TYPE && type !== SLACK_CHANNEL_TYPE) {
                ui.error(`Unsupported channel type: ${type}. Supported: ${TELEGRAM_CHANNEL_TYPE}, ${SLACK_CHANNEL_TYPE}`);
                return;
            }

            const channelName = channelService.resolveConnectChannelName(options.name);
            const configStore = new ConfigStore();
            const existing = await configStore.getChannel(channelName);

            if (type === SLACK_CHANNEL_TYPE) {
                ui.info('Create a single-workspace Slack app from the AI DevKit Socket Mode manifest.');
                const appToken = String(await password({
                    message: 'Enter your Slack app-level token (xapp-…):',
                    validate: (input: string) => input.trim().startsWith('xapp-') || 'App token must start with xapp-',
                })).trim();
                const botToken = String(await password({
                    message: 'Enter your Slack bot token (xoxb-…):',
                    validate: (input: string) => input.trim().startsWith('xoxb-') || 'Bot token must start with xoxb-',
                })).trim();
                const spinner = ui.spinner('Validating Slack bot identity...');
                spinner.start();
                let stage = 'app token validation';
                try {
                    await validateSlackAppToken(appToken);
                    stage = 'bot token validation';
                    const identity = await validateSlackCredentials(botToken);
                    const entry: ChannelEntry = {
                        type: SLACK_CHANNEL_TYPE,
                        enabled: true,
                        createdAt: existing?.createdAt ?? new Date().toISOString(),
                        config: {
                            appToken,
                            botToken,
                            ...identity,
                            transport: 'socket-mode',
                            audience: 'dm',
                        },
                    };
                    stage = 'configuration save';
                    await configStore.saveChannel(channelName, entry);
                    spinner.succeed(`Connected to Slack workspace ${identity.workspaceName ?? identity.workspaceId}`);
                    ui.success(`Slack channel "${channelName}" configured successfully!`);
                    ui.info(`Run "ai-devkit channel start ${channelName} --agent <name>", then DM the Slack app.`);
                } catch (error: unknown) {
                    const message = redactSecrets(getErrorMessage(error), [appToken, botToken]);
                    debug(`Slack ${stage} failed: ${message}`);
                    spinner.fail('Invalid Slack credentials. Please check and try again.');
                }
                return;
            }

            ui.info('To connect Telegram, you need a bot token from @BotFather.');
            ui.info('Open Telegram, search for @BotFather, and create a new bot.\n');

            const botToken = await password({
                message: 'Enter your Telegram bot token:',
                validate: (input: string) => {
                    if (!input.trim()) return 'Bot token is required';
                    if (!input.includes(':')) return 'Invalid token format (expected number:hash)';
                    return true;
                },
            });

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
                const identity = entry.type === SLACK_CHANNEL_TYPE
                    ? (entry.config as SlackConfig).workspaceName ?? (entry.config as SlackConfig).workspaceId
                    : `@${(entry.config as TelegramConfig).botUsername}`;
                const authorization = entry.type === SLACK_CHANNEL_TYPE
                    ? 'n/a'
                    : (entry.config as TelegramConfig).authorizedChatId ? 'yes' : 'no';
                return [
                    name,
                    entry.type,
                    entry.enabled ? chalk.green('enabled') : chalk.dim('disabled'),
                    identity || '-',
                    authorization,
                    liveByChannel.has(name) ? chalk.green('running') : chalk.dim('stopped'),
                    entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '-',
                ];
            });

            ui.table({
                headers: ['Name', 'Type', 'Status', 'Identity', 'Authorized', 'Bridge', 'Created'],
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

            const shouldRemove = await confirm({
                message: `Remove "${channelName}" channel configuration?`,
                default: false,
            });

            if (!shouldRemove) return;

            await configStore.removeChannel(channelName);
            ui.success(`${channelName} channel disconnected.`);
        }));

    channelCommand
        .command('start [name]')
        .description('Start the channel bridge to a running agent')
        .requiredOption('--agent <name>', 'Name of the agent to bridge')
        .option('--daemon', 'Start the channel bridge in the background')
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

            if (options.daemon) {
                const daemonLaunch = resolveDaemonLaunch();
                const daemonArgs = [
                    ...daemonLaunch.args,
                    '--channel',
                    channelName,
                    '--agent',
                    options.agent,
                ];
                if (options.debug) {
                    daemonArgs.push('--debug');
                }

                const bridge = await channelService.startDaemonBridge({
                    channelName,
                    channelType: channelEntry.type,
                    agentName: options.agent,
                    command: daemonLaunch.command,
                    args: daemonArgs,
                    cwd: process.cwd(),
                });

                ui.success(`Channel bridge daemon started for "${channelName}" (PID: ${bridge.bridgePid}).`);
                if (bridge.logPath) {
                    ui.info(`Logs: ${bridge.logPath}`);
                }
                ui.info(`Run "ai-devkit channel stop ${channelName}" to stop it.`);
                return;
            }

            if (runningBridge) {
                ui.error(`Channel "${channelName}" bridge is already running (PID: ${runningBridge.bridgePid}).`);
                return;
            }

            await runChannelBridge({
                channelName,
                agentName: options.agent,
                configStore,
                channelService,
            });
        }));

    channelCommand
        .command('stop [name]')
        .description('Stop a running channel bridge')
        .action(withErrorHandler('stop channel bridge', async (name: string | undefined) => {
            const result = await channelService.stopBridge(name);
            if (!result.stopped || !result.bridge) {
                ui.info('No running channel bridge found.');
                return;
            }

            ui.success(`Channel bridge stopped: ${result.bridge.channelName} (PID: ${result.bridge.bridgePid}).`);
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
                const bridge = liveByChannel.get(name);
                const identity = entry.type === SLACK_CHANNEL_TYPE
                    ? `${(entry.config as SlackConfig).workspaceName ?? (entry.config as SlackConfig).workspaceId} (bot ${(entry.config as SlackConfig).botUserId})`
                    : `@${(entry.config as TelegramConfig).botUsername || 'unknown'}`;
                const authorization = entry.type === SLACK_CHANNEL_TYPE
                    ? 'n/a (POC)'
                    : (entry.config as TelegramConfig).authorizedChatId ? 'yes' : 'no';
                ui.text(`${chalk.bold(name)} (${entry.type})`);
                ui.text(`  Enabled: ${entry.enabled ? chalk.green('yes') : chalk.red('no')}`);
                ui.text(`  Identity: ${identity}`);
                ui.text(`  Authorized: ${authorization}`);
                ui.text(`  Bridge: ${bridge ? chalk.green(`running (PID: ${bridge.bridgePid}, agent: ${bridge.agentName})`) : chalk.dim('stopped')}`);
                if (bridge?.logPath) {
                    ui.text(`  Logs: ${bridge.logPath}`);
                }
                ui.text(`  Configured: ${entry.createdAt || 'unknown'}`);
                ui.breakline();
            }
        }));
}
