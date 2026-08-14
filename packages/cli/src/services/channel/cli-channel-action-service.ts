import {
    ConfigStore,
    createChannelActionService,
    type ChannelActionResult,
} from '@ai-devkit/channel-connector';
import { createLogger, enableDebug } from '../../util/debug.js';
import { ui } from '../../util/terminal-ui.js';
import { resolveDaemonLaunch } from './daemon-launch.js';
import { runChannelBridge } from './channel-runner.js';
import { ChannelService } from './channel.service.js';

const debug = createLogger('channel');

export interface StartCliChannelInput {
    channelName?: string;
    agentName: string;
    daemon: boolean;
    debug?: boolean;
}

export interface CliChannelActionService {
    start(input: StartCliChannelInput): Promise<ChannelActionResult>;
    stop(input: { channelName?: string }): Promise<ChannelActionResult>;
}

export function createCliChannelActionService(
    channelService = new ChannelService(),
): CliChannelActionService {
    const configStore = new ConfigStore();
    const actions = createChannelActionService({
        configStore,
        bridgeService: channelService,
        reporter: ui,
    });

    return {
        async start(input) {
            if (input.debug) enableDebug();
            if (input.daemon) {
                return actions.startDaemon({
                    channelName: input.channelName,
                    agentName: input.agentName,
                    launch: resolveDaemonLaunch(),
                    debug: input.debug,
                });
            }

            debug('Loading channel configuration from ConfigStore');
            const config = await configStore.getConfig();
            const channelName = channelService.resolveStartChannelName(config, input.channelName);
            debug(`Starting channel bridge: channel=${channelName}, agent=${input.agentName}`);
            const channelEntry = config.channels[channelName];
            const runningBridge = await channelService.getLiveBridgeByChannel(channelName);

            if (!channelEntry) {
                const message = `No channel configured with name "${channelName}".`;
                ui.error(message);
                const availableChannels = Object.keys(config.channels);
                if (availableChannels.length > 0) ui.info(`Available channels: ${availableChannels.join(', ')}`);
                return { ok: false, message };
            }
            if (runningBridge) {
                const message = `Channel "${channelName}" bridge is already running (PID: ${runningBridge.bridgePid}).`;
                ui.error(message);
                return { ok: false, message };
            }

            await runChannelBridge({ channelName, agentName: input.agentName, configStore, channelService });
            return { ok: true };
        },
        stop: (input) => actions.stop(input),
    };
}
