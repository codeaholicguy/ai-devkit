import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfigStore, type ChannelConfig, type TelegramConfig } from '@ai-devkit/channel-connector';
import { ChannelService, type ChannelBridgeProcess } from '../../../services/channel/channel.service.js';
import type { AgentChannelStatusMap, ConfiguredChannel } from '../types.js';

export interface UseChannelStateResult {
    channelStatuses: AgentChannelStatusMap;
    refreshChannels: () => Promise<void>;
    configuredChannels: ConfiguredChannel[];
    refreshConfiguredChannels: () => Promise<void>;
}

export function buildAgentChannelStatuses(bridges: ChannelBridgeProcess[]): AgentChannelStatusMap {
    return Object.fromEntries(
        bridges.map(bridge => [
            bridge.agentName,
            {
                channelName: bridge.channelName,
                channelType: bridge.channelType,
                bridgePid: bridge.bridgePid,
            },
        ]),
    );
}

export function buildConfiguredChannels(config: ChannelConfig): ConfiguredChannel[] {
    return Object.entries(config.channels).map(([name, entry]) => {
        const telegramConfig = entry.config as TelegramConfig | undefined;
        return {
            name,
            type: entry.type,
            enabled: entry.enabled,
            botUsername: telegramConfig?.botUsername,
        };
    });
}

export function channelStatusesEqual(a: AgentChannelStatusMap, b: AgentChannelStatusMap): boolean {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
        const left = a[key];
        const right = b[key];
        if (
            !right
            || left.channelName !== right.channelName
            || left.channelType !== right.channelType
            || left.bridgePid !== right.bridgePid
        ) return false;
    }
    return true;
}

export function configuredChannelsEqual(a: ConfiguredChannel[], b: ConfiguredChannel[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const left = a[i];
        const right = b[i];
        if (
            left.name !== right.name
            || left.type !== right.type
            || left.enabled !== right.enabled
            || left.botUsername !== right.botUsername
        ) return false;
    }
    return true;
}

export function useChannelState(
    channelService?: ChannelService,
    configStore?: ConfigStore,
    intervalMs = 3000,
    paused = false,
): UseChannelStateResult {
    const serviceRef = useRef<ChannelService>(channelService ?? new ChannelService());
    const configStoreRef = useRef<ConfigStore>(configStore ?? new ConfigStore());
    const [channelStatuses, setChannelStatuses] = useState<AgentChannelStatusMap>({});
    const [configuredChannels, setConfiguredChannels] = useState<ConfiguredChannel[]>([]);

    const refreshChannels = useCallback(async (): Promise<void> => {
        const liveBridges = await serviceRef.current.getLiveBridges();
        const next = buildAgentChannelStatuses(liveBridges);
        setChannelStatuses(prev => channelStatusesEqual(prev, next) ? prev : next);
    }, []);

    const refreshConfiguredChannels = useCallback(async (): Promise<void> => {
        const config = await configStoreRef.current.getConfig();
        const next = buildConfiguredChannels(config);
        setConfiguredChannels(prev => configuredChannelsEqual(prev, next) ? prev : next);
    }, []);

    useEffect(() => {
        if (paused) return undefined;

        const refreshAll = (): void => {
            void refreshChannels().catch(() => {
                setChannelStatuses(prev => channelStatusesEqual(prev, {}) ? prev : {});
            });
            void refreshConfiguredChannels().catch(() => {
                setConfiguredChannels(prev => configuredChannelsEqual(prev, []) ? prev : []);
            });
        };

        refreshAll();
        const handle = setInterval(refreshAll, intervalMs);
        return () => clearInterval(handle);
    }, [intervalMs, paused, refreshChannels, refreshConfiguredChannels]);

    return {
        channelStatuses,
        refreshChannels,
        configuredChannels,
        refreshConfiguredChannels,
    };
}
