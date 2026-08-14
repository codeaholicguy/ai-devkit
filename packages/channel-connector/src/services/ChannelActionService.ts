import { ConfigStore } from '../ConfigStore.js';
import { ChannelService } from './ChannelService.js';

export interface ChannelActionResult {
    ok: boolean;
    message?: string;
}

export interface ChannelActionReporter {
    info(message: string): void;
    success(message: string): void;
    error(message: string): void;
}

export interface DaemonLaunch {
    command: string;
    args: string[];
    cwd: string;
}

export interface StartDaemonChannelInput {
    channelName?: string;
    agentName: string;
    launch: DaemonLaunch;
    debug?: boolean;
}

export interface StopChannelInput {
    channelName?: string;
}

export interface ChannelActionService {
    startDaemon(input: StartDaemonChannelInput): Promise<ChannelActionResult>;
    stop(input: StopChannelInput): Promise<ChannelActionResult>;
}

type ConfigStoreLike = Pick<ConfigStore, 'getConfig'>;
type BridgeServiceLike = Pick<
    ChannelService,
    'resolveStartChannelName' | 'getLiveBridgeByChannel' | 'startDaemonBridge' | 'stopBridge'
>;

export interface ChannelActionServiceDependencies {
    configStore?: ConfigStoreLike;
    bridgeService?: BridgeServiceLike;
    reporter?: ChannelActionReporter;
}

function createSilentReporter(): ChannelActionReporter {
    const noOutput = () => undefined;
    return { info: noOutput, success: noOutput, error: noOutput };
}

export function createChannelActionService(
    dependencies: ChannelActionServiceDependencies = {},
): ChannelActionService {
    const configStore = dependencies.configStore ?? new ConfigStore();
    const bridgeService = dependencies.bridgeService ?? new ChannelService();
    const reporter = dependencies.reporter ?? createSilentReporter();

    return {
        async startDaemon(input) {
            const config = await configStore.getConfig();
            const channelName = bridgeService.resolveStartChannelName(config, input.channelName);
            const channelEntry = config.channels[channelName];
            await bridgeService.getLiveBridgeByChannel(channelName);

            if (!channelEntry) {
                const message = `No channel configured with name "${channelName}".`;
                reporter.error(message);
                const availableChannels = Object.keys(config.channels);
                if (availableChannels.length > 0) {
                    reporter.info(`Available channels: ${availableChannels.join(', ')}`);
                }
                return { ok: false, message };
            }

            const args = [
                ...input.launch.args,
                '--channel',
                channelName,
                '--agent',
                input.agentName,
            ];
            if (input.debug) args.push('--debug');

            const bridge = await bridgeService.startDaemonBridge({
                channelName,
                channelType: channelEntry.type,
                agentName: input.agentName,
                command: input.launch.command,
                args,
                cwd: input.launch.cwd,
            });
            reporter.success(`Channel bridge daemon started for "${channelName}" (PID: ${bridge.bridgePid}).`);
            if (bridge.logPath) reporter.info(`Logs: ${bridge.logPath}`);
            reporter.info(`Run "ai-devkit channel stop ${channelName}" to stop it.`);
            return { ok: true };
        },

        async stop(input) {
            const result = await bridgeService.stopBridge(input.channelName);
            if (!result.stopped || !result.bridge) {
                const message = 'No running channel bridge found.';
                reporter.info(message);
                return { ok: false, message };
            }
            reporter.success(`Channel bridge stopped: ${result.bridge.channelName} (PID: ${result.bridge.bridgePid}).`);
            return { ok: true };
        },
    };
}
