import path from 'path';
import { fileURLToPath } from 'url';
import { ConfigStore } from '@ai-devkit/channel-connector';
import { createLogger, enableDebug } from '../../util/debug.js';
import { ui } from '../../util/terminal-ui.js';
import { actionFailed, actionSucceeded, type ApplicationActionResult } from '../actions/action-result.js';
import { ChannelService } from './channel.service.js';
import { runChannelBridge } from './channel-runner.js';

const debug = createLogger('channel');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ChannelActionReporter {
    info(message: string): void;
    success(message: string): void;
    error(message: string): void;
}
type ConfigStoreLike = Pick<ConfigStore, 'getConfig'>;
type ChannelServiceLike = Pick<
    ChannelService,
    'resolveStartChannelName' | 'getLiveBridgeByChannel' | 'startDaemonBridge' | 'stopBridge'
>;

export interface StartChannelActionInput {
    channelName?: string;
    agentName: string;
    daemon: boolean;
    debug?: boolean;
}

export interface StopChannelActionInput {
    channelName?: string;
}

export interface ChannelActionService {
    start(input: StartChannelActionInput): Promise<ApplicationActionResult>;
    stop(input: StopChannelActionInput): Promise<ApplicationActionResult>;
}

interface DaemonLaunch {
    command: string;
    args: string[];
}

export interface ChannelActionServiceDependencies {
    configStore?: ConfigStoreLike;
    channelService?: ChannelServiceLike;
    reporter?: ChannelActionReporter;
    resolveDaemonLaunch?: () => DaemonLaunch;
    runBridge?: typeof runChannelBridge;
    cwd?: () => string;
}

export function resolveDaemonLaunch(): DaemonLaunch {
    if (path.extname(__filename) === '.ts') {
        return {
            command: process.execPath,
            args: [
                '--no-warnings',
                '--loader',
                'ts-node/esm',
                path.resolve(__dirname, '..', '..', 'channel-daemon.ts'),
            ],
        };
    }
    return {
        command: process.execPath,
        args: [path.resolve(__dirname, '..', '..', 'channel-daemon.js')],
    };
}

export function createChannelActionService(
    dependencies: ChannelActionServiceDependencies = {},
): ChannelActionService {
    const configStore = dependencies.configStore ?? new ConfigStore();
    const channelService = dependencies.channelService ?? new ChannelService();
    const reporter = dependencies.reporter ?? ui;
    const daemonLaunch = dependencies.resolveDaemonLaunch ?? resolveDaemonLaunch;
    const runBridge = dependencies.runBridge ?? runChannelBridge;
    const cwd = dependencies.cwd ?? (() => process.cwd());

    return {
        async start(input) {
            if (input.debug) enableDebug();
            debug('Loading channel configuration from ConfigStore');
            const config = await configStore.getConfig();
            const channelName = channelService.resolveStartChannelName(config, input.channelName);
            debug(`Starting channel bridge: channel=${channelName}, agent=${input.agentName}`);
            const channelEntry = config.channels[channelName];
            const runningBridge = await channelService.getLiveBridgeByChannel(channelName);

            if (!channelEntry) {
                const message = `No channel configured with name "${channelName}".`;
                reporter.error(message);
                const availableChannels = Object.keys(config.channels);
                if (availableChannels.length > 0) {
                    reporter.info(`Available channels: ${availableChannels.join(', ')}`);
                }
                return actionFailed(message);
            }

            if (input.daemon) {
                const launch = daemonLaunch();
                const args = [
                    ...launch.args,
                    '--channel',
                    channelName,
                    '--agent',
                    input.agentName,
                ];
                if (input.debug) args.push('--debug');
                const bridge = await channelService.startDaemonBridge({
                    channelName,
                    channelType: channelEntry.type,
                    agentName: input.agentName,
                    command: launch.command,
                    args,
                    cwd: cwd(),
                });
                reporter.success(`Channel bridge daemon started for "${channelName}" (PID: ${bridge.bridgePid}).`);
                if (bridge.logPath) reporter.info(`Logs: ${bridge.logPath}`);
                reporter.info(`Run "ai-devkit channel stop ${channelName}" to stop it.`);
                return actionSucceeded();
            }

            if (runningBridge) {
                const message = `Channel "${channelName}" bridge is already running (PID: ${runningBridge.bridgePid}).`;
                reporter.error(message);
                return actionFailed(message);
            }

            await runBridge({
                channelName,
                agentName: input.agentName,
                configStore: configStore as ConfigStore,
                channelService: channelService as ChannelService,
            });
            return actionSucceeded();
        },

        async stop(input) {
            const result = await channelService.stopBridge(input.channelName);
            if (!result.stopped || !result.bridge) {
                const message = 'No running channel bridge found.';
                reporter.info(message);
                return actionFailed(message);
            }
            reporter.success(`Channel bridge stopped: ${result.bridge.channelName} (PID: ${result.bridge.bridgePid}).`);
            return actionSucceeded();
        },
    };
}
