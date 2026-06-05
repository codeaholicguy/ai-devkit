import { describe, expect, it } from 'vitest';
import {
    buildAgentChannelStatuses,
    buildConfiguredChannels,
} from '../../../tui/console/state/ConsoleContext.js';
import {
    channelStatusesEqual,
    configuredChannelsEqual,
} from '../../../tui/console/hooks/useChannelState.js';

describe('buildAgentChannelStatuses', () => {
    it('keys live channel bridge status by agent name', () => {
        expect(
            buildAgentChannelStatuses([
                {
                    channelName: 'telegram',
                    channelType: 'telegram',
                    agentName: 'api-agent',
                    agentPid: 123,
                    bridgePid: 456,
                    startedAt: '2026-06-04T00:00:00.000Z',
                },
            ]),
        ).toEqual({
            'api-agent': {
                channelName: 'telegram',
                channelType: 'telegram',
                bridgePid: 456,
            },
        });
    });

    it('returns an empty map for no live bridges', () => {
        expect(buildAgentChannelStatuses([])).toEqual({});
    });
});

describe('buildConfiguredChannels', () => {
    it('returns configured channels without bot tokens', () => {
        expect(
            buildConfiguredChannels({
                channels: {
                    personal: {
                        type: 'telegram',
                        enabled: true,
                        createdAt: '2026-06-04T00:00:00.000Z',
                        config: {
                            botToken: 'secret',
                            botUsername: 'personal_bot',
                        },
                    },
                    work: {
                        type: 'telegram',
                        enabled: false,
                        createdAt: '2026-06-04T00:00:00.000Z',
                        config: {
                            botToken: 'secret-2',
                            botUsername: 'work_bot',
                        },
                    },
                },
            }),
        ).toEqual([
            {
                name: 'personal',
                type: 'telegram',
                enabled: true,
                botUsername: 'personal_bot',
            },
            {
                name: 'work',
                type: 'telegram',
                enabled: false,
                botUsername: 'work_bot',
            },
        ]);
    });
});

describe('channelStatusesEqual', () => {
    it('returns true for equivalent channel status maps', () => {
        expect(
            channelStatusesEqual(
                { api: { channelName: 'work', channelType: 'telegram', bridgePid: 123 } },
                { api: { channelName: 'work', channelType: 'telegram', bridgePid: 123 } },
            ),
        ).toBe(true);
    });

    it('returns false when status map entries differ', () => {
        expect(
            channelStatusesEqual(
                { api: { channelName: 'work', channelType: 'telegram', bridgePid: 123 } },
                { api: { channelName: 'personal', channelType: 'telegram', bridgePid: 123 } },
            ),
        ).toBe(false);
    });
});

describe('configuredChannelsEqual', () => {
    it('returns true for equivalent configured channel lists', () => {
        expect(
            configuredChannelsEqual(
                [{ name: 'work', type: 'telegram', enabled: true, botUsername: 'work_bot' }],
                [{ name: 'work', type: 'telegram', enabled: true, botUsername: 'work_bot' }],
            ),
        ).toBe(true);
    });

    it('returns false when configured channel metadata differs', () => {
        expect(
            configuredChannelsEqual(
                [{ name: 'work', type: 'telegram', enabled: true, botUsername: 'work_bot' }],
                [{ name: 'work', type: 'telegram', enabled: false, botUsername: 'work_bot' }],
            ),
        ).toBe(false);
    });
});
