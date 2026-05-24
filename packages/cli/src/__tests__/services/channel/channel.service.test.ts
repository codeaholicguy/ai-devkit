import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ChannelService } from '../../../services/channel/channel.service';

describe('ChannelService', () => {
    let tmpDir: string;
    let registryPath: string;
    let alivePids: Set<number>;
    let service: ChannelService;

    const personalEntry = {
        type: 'telegram' as const,
        enabled: true,
        createdAt: '2026-05-23T00:00:00.000Z',
        config: {
            botToken: '123:abc',
            botUsername: 'personal_bot',
        },
    };

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'channel-service-test-'));
        registryPath = path.join(tmpDir, 'channel-bridges.json');
        alivePids = new Set();
        service = new ChannelService(registryPath, pid => alivePids.has(pid));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('uses the default telegram channel name when connect --name is omitted', () => {
        expect(service.resolveConnectChannelName(undefined)).toBe('telegram');
    });

    it('uses the provided channel name when connect --name is set', () => {
        expect(service.resolveConnectChannelName('personal')).toBe('personal');
    });

    it('rejects invalid channel names', () => {
        expect(() => service.resolveConnectChannelName('Personal Bot')).toThrow(
            'Channel name must be kebab-case using lowercase letters, numbers, and hyphens.',
        );
    });

    it('rejects duplicate Telegram tokens across different channel names', () => {
        expect(() => service.assertUniqueTelegramToken({
            channels: {
                personal: personalEntry,
            },
        }, 'work', '123:abc')).toThrow('Telegram bot token is already configured for channel "personal".');
    });

    it('allows updating the same channel with its existing Telegram token', () => {
        expect(() => service.assertUniqueTelegramToken({
            channels: {
                telegram: personalEntry,
            },
        }, 'telegram', '123:abc')).not.toThrow();
    });

    it('uses the explicit channel name for start when provided', () => {
        expect(service.resolveStartChannelName({
            channels: {
                telegram: personalEntry,
                work: { ...personalEntry, config: { ...personalEntry.config, botToken: '456:def' } },
            },
        }, 'work')).toBe('work');
    });

    it('infers the sole configured Telegram channel for start when name is omitted', () => {
        expect(service.resolveStartChannelName({
            channels: {
                personal: personalEntry,
            },
        }, undefined)).toBe('personal');
    });

    it('requires an explicit channel name for start when multiple Telegram channels exist', () => {
        expect(() => service.resolveStartChannelName({
            channels: {
                personal: personalEntry,
                work: { ...personalEntry, config: { ...personalEntry.config, botToken: '456:def' } },
            },
        }, undefined)).toThrow('Multiple Telegram channels configured. Specify one: personal, work');
    });

    it('fails start resolution when no Telegram channels exist', () => {
        expect(() => service.resolveStartChannelName({
            channels: {},
        }, undefined)).toThrow('No Telegram channel configured. Run "ai-devkit channel connect telegram" first.');
    });

    it('stores multiple bridge entries by channel name', async () => {
        await service.registerBridge({
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            agentPid: 100,
            bridgePid: 200,
            startedAt: '2026-05-23T00:00:00.000Z',
        });
        await service.registerBridge({
            channelName: 'team-slack',
            channelType: 'slack',
            agentName: 'claude-review',
            agentPid: 101,
            bridgePid: 201,
            startedAt: '2026-05-23T00:01:00.000Z',
        });
        alivePids.add(200);
        alivePids.add(201);

        const liveBridges = await service.getLiveBridges();

        expect(liveBridges).toEqual([
            expect.objectContaining({ channelName: 'personal', channelType: 'telegram', bridgePid: 200 }),
            expect.objectContaining({ channelName: 'team-slack', channelType: 'slack', bridgePid: 201 }),
        ]);
        expect(await service.getLiveBridgeByChannel('team-slack')).toEqual(expect.objectContaining({
            channelName: 'team-slack',
            agentName: 'claude-review',
        }));
    });

    it('prunes stale bridge entries', async () => {
        alivePids.add(200);
        await service.registerBridge({
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            agentPid: 100,
            bridgePid: 200,
            startedAt: '2026-05-23T00:00:00.000Z',
        });
        await service.registerBridge({
            channelName: 'work',
            channelType: 'telegram',
            agentName: 'claude-review',
            agentPid: 101,
            bridgePid: 201,
            startedAt: '2026-05-23T00:01:00.000Z',
        });

        const live = await service.getLiveBridges();

        expect(live).toEqual([
            expect.objectContaining({ channelName: 'personal', bridgePid: 200 }),
        ]);
        expect(await service.getLiveBridgeByChannel('work')).toBeUndefined();
    });

    it('unregisters a bridge by channel name', async () => {
        await service.registerBridge({
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            agentPid: 100,
            bridgePid: 200,
            startedAt: '2026-05-23T00:00:00.000Z',
        });

        await service.unregisterBridge('personal');

        expect(await service.getLiveBridgeByChannel('personal')).toBeUndefined();
    });
});
