import { PassThrough } from 'node:stream';
import React from 'react';
import { render, Text } from 'ink';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentManager } from '@ai-devkit/agent-manager';
import type { ConfigStore } from '@ai-devkit/channel-connector';
import type { ChannelService } from '../../../services/channel/channel.service.js';
import {
    ConsoleProvider,
    useConsoleAgentContext,
} from '../../../tui/console/state/ConsoleContext.js';

describe('ConsoleProvider subscriptions', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not rerender an agent-only consumer when only channel state changes', async () => {
        vi.useFakeTimers();
        const manager = {
            listAgents: vi.fn().mockResolvedValue([]),
        } as unknown as AgentManager;
        const channelService = {
            getLiveBridges: vi.fn()
                .mockResolvedValueOnce([])
                .mockResolvedValue([{
                    channelName: 'telegram',
                    channelType: 'telegram',
                    agentName: 'agent-1',
                    bridgePid: 42,
                }]),
        } as unknown as ChannelService;
        const configStore = {
            getConfig: vi.fn().mockResolvedValue({ channels: {} }),
        } as unknown as ConfigStore;
        let agentConsumerRenders = 0;
        let agentListLoading = true;
        const AgentOnlyConsumer = () => {
            const { agents, isLoading } = useConsoleAgentContext();
            agentConsumerRenders += 1;
            agentListLoading = isLoading;
            return React.createElement(Text, null, agents.length);
        };
        const output = new PassThrough();
        const instance = render(
            React.createElement(
                ConsoleProvider,
                { manager, inputFocused: false, channelService, configStore },
                React.createElement(AgentOnlyConsumer),
            ),
            {
                stdout: output as unknown as NodeJS.WriteStream,
                interactive: false,
                patchConsole: false,
            },
        );

        await vi.waitFor(() => {
            expect(manager.listAgents).toHaveBeenCalledOnce();
            expect(channelService.getLiveBridges).toHaveBeenCalledOnce();
            expect(configStore.getConfig).toHaveBeenCalledOnce();
            expect(agentListLoading).toBe(false);
        });
        await vi.runAllTicks();
        const rendersAfterInitialLoad = agentConsumerRenders;

        await vi.advanceTimersByTimeAsync(3000);
        await vi.waitFor(() => {
            expect(channelService.getLiveBridges).toHaveBeenCalledTimes(2);
        });
        await vi.runAllTicks();

        expect(agentConsumerRenders).toBe(rendersAfterInitialLoad);
        instance.unmount();
        await instance.waitUntilExit();
    });

    it('pauses both polling subscriptions and refreshes immediately after resuming', async () => {
        vi.useFakeTimers();
        const manager = {
            listAgents: vi.fn().mockResolvedValue([]),
        } as unknown as AgentManager;
        const channelService = {
            getLiveBridges: vi.fn().mockResolvedValue([]),
        } as unknown as ChannelService;
        const configStore = {
            getConfig: vi.fn().mockResolvedValue({ channels: {} }),
        } as unknown as ConfigStore;
        const output = new PassThrough();
        const renderProvider = (paused: boolean) => React.createElement(
            ConsoleProvider,
            { manager, inputFocused: paused, channelService, configStore },
            React.createElement(Text, null, 'child'),
        );
        const instance = render(renderProvider(false), {
            stdout: output as unknown as NodeJS.WriteStream,
            interactive: false,
            patchConsole: false,
        });

        await vi.advanceTimersByTimeAsync(0);
        expect(manager.listAgents).toHaveBeenCalledOnce();
        expect(channelService.getLiveBridges).toHaveBeenCalledOnce();
        expect(configStore.getConfig).toHaveBeenCalledOnce();

        instance.rerender(renderProvider(true));
        await vi.advanceTimersByTimeAsync(6000);
        expect(manager.listAgents).toHaveBeenCalledOnce();
        expect(channelService.getLiveBridges).toHaveBeenCalledOnce();
        expect(configStore.getConfig).toHaveBeenCalledOnce();

        instance.rerender(renderProvider(false));
        await vi.advanceTimersByTimeAsync(0);
        expect(manager.listAgents).toHaveBeenCalledTimes(2);
        expect(channelService.getLiveBridges).toHaveBeenCalledTimes(2);
        expect(configStore.getConfig).toHaveBeenCalledTimes(2);
        instance.unmount();
        await instance.waitUntilExit();
    });
});
