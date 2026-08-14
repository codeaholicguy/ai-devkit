import { describe, expect, it, vi } from 'vitest';
import { createChannelActionService } from '../../services/ChannelActionService.js';

describe('ChannelActionService', () => {
    it('owns daemon bridge startup in the channel-connector package', async () => {
        const startDaemonBridge = vi.fn().mockResolvedValue({
            channelName: 'work',
            channelType: 'telegram',
            agentName: 'jarvis',
            agentPid: 0,
            bridgePid: 99,
            startedAt: '2026-08-14T00:00:00.000Z',
        });
        const service = createChannelActionService({
            configStore: {
                getConfig: vi.fn().mockResolvedValue({
                    channels: {
                        work: { type: 'telegram', enabled: true, createdAt: '', config: {} },
                    },
                }),
            },
            bridgeService: {
                resolveStartChannelName: vi.fn().mockReturnValue('work'),
                getLiveBridgeByChannel: vi.fn().mockResolvedValue(undefined),
                startDaemonBridge,
                stopBridge: vi.fn(),
            },
        });

        await expect(service.startDaemon({
            channelName: 'work',
            agentName: 'jarvis',
            launch: { command: 'node', args: ['daemon.js'], cwd: '/tmp/project' },
        })).resolves.toMatchObject({ ok: true });
        expect(startDaemonBridge).toHaveBeenCalledWith(expect.objectContaining({
            channelName: 'work',
            agentName: 'jarvis',
            command: 'node',
            args: ['daemon.js', '--channel', 'work', '--agent', 'jarvis'],
            cwd: '/tmp/project',
        }));
    });
});
