import type { Mock } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ChannelService } from '../../../services/channel/channel.service.js';

describe('ChannelService', () => {
    let tmpDir: string;
    let registryPath: string;
    let alivePids: Set<number>;
    let spawned: Array<{ command: string; args: string[]; options: { cwd: string; detached: true; stdio: ['ignore', number, number] }; unref: Mock }>;
    let killed: Array<{ pid: number; signal: NodeJS.Signals }>;
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
        spawned = [];
        killed = [];
        service = new ChannelService(
            registryPath,
            pid => alivePids.has(pid),
            (command: string, args: string[], options: { cwd: string; detached: true; stdio: ['ignore', number, number] }) => {
                const child = { pid: 300, unref: vi.fn() };
                spawned.push({ command, args, options, unref: child.unref });
                return child;
            },
            (pid: number, signal: NodeJS.Signals) => {
                killed.push({ pid, signal });
            },
        );
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

    it('starts a daemon bridge by spawning a detached child and recording its pid', async () => {
        const bridge = await service.startDaemonBridge({
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            command: 'node',
            args: ['dist/channel-daemon.js', '--channel', 'personal', '--agent', 'codex-main'],
            cwd: '/tmp/project',
        });
        alivePids.add(300);

        expect(spawned).toEqual([expect.objectContaining({
            command: 'node',
            args: ['dist/channel-daemon.js', '--channel', 'personal', '--agent', 'codex-main'],
            options: {
                cwd: '/tmp/project',
                detached: true,
                stdio: ['ignore', expect.any(Number), expect.any(Number)],
            },
        })]);
        expect(bridge).toEqual(expect.objectContaining({
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            agentPid: 0,
            bridgePid: 300,
            logPath: path.join(tmpDir, 'channel-logs', 'personal.log'),
        }));
        expect(spawned[0].options.stdio[1]).toBe(spawned[0].options.stdio[2]);
        expect(fs.readFileSync(path.join(tmpDir, 'channel-logs', 'personal.log'), 'utf-8')).toContain(
            '[command] node dist/channel-daemon.js --channel personal --agent codex-main',
        );
        expect(await service.getLiveBridgeByChannel('personal')).toEqual(expect.objectContaining({
            channelName: 'personal',
            bridgePid: 300,
            logPath: path.join(tmpDir, 'channel-logs', 'personal.log'),
        }));
    });

    it('refuses to start a daemon when the channel already has a live bridge', async () => {
        alivePids.add(200);
        await service.registerBridge({
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            agentPid: 100,
            bridgePid: 200,
            startedAt: '2026-05-23T00:00:00.000Z',
        });

        await expect(service.startDaemonBridge({
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            command: 'node',
            args: ['dist/cli.js'],
            cwd: '/tmp/project',
        })).rejects.toThrow('Channel "personal" bridge is already running (PID: 200).');
        expect(spawned).toEqual([]);
    });

    it('prunes stale state before starting a daemon bridge', async () => {
        await service.registerBridge({
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            agentPid: 100,
            bridgePid: 200,
            startedAt: '2026-05-23T00:00:00.000Z',
        });

        await service.startDaemonBridge({
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            command: 'node',
            args: ['dist/cli.js'],
            cwd: '/tmp/project',
        });

        alivePids.add(300);
        expect(await service.getLiveBridgeByChannel('personal')).toEqual(expect.objectContaining({
            bridgePid: 300,
        }));
    });

    it('stops the only live bridge when no channel name is provided', async () => {
        alivePids.add(200);
        await service.registerBridge({
            channelName: 'personal',
            channelType: 'telegram',
            agentName: 'codex-main',
            agentPid: 100,
            bridgePid: 200,
            startedAt: '2026-05-23T00:00:00.000Z',
        });

        const result = await service.stopBridge();

        expect(result).toEqual({
            stopped: true,
            bridge: expect.objectContaining({ channelName: 'personal', bridgePid: 200 }),
        });
        expect(killed).toEqual([{ pid: 200, signal: 'SIGTERM' }]);
        expect(await service.getLiveBridgeByChannel('personal')).toBeUndefined();
    });

    it('requires a channel name when multiple live bridges exist', async () => {
        alivePids.add(200);
        alivePids.add(201);
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

        await expect(service.stopBridge()).rejects.toThrow('Multiple channel bridges are running. Specify one: personal, work');
        expect(killed).toEqual([]);
    });
});
