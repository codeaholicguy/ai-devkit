import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ChannelConfigRepository } from '../ChannelConfigRepository.js';
import { isSlackEntry } from '../types.js';
import type { ChannelEntry } from '../types.js';

describe('ChannelConfigRepository', () => {
    let tmpDir: string;
    let configPath: string;
    let store: ChannelConfigRepository;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'channel-connector-test-'));
        configPath = path.join(tmpDir, 'channels.json');
        store = new ChannelConfigRepository(configPath);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const sampleEntry: ChannelEntry = {
        type: 'telegram',
        enabled: true,
        createdAt: '2026-04-11T00:00:00Z',
        config: {
            botToken: 'test-token-123',
            botUsername: 'test_bot',
        },
    };

    const slackEntry: ChannelEntry = {
        type: 'slack',
        enabled: true,
        createdAt: '2026-08-06T00:00:00Z',
        config: {
            appToken: 'xapp-fake',
            botToken: 'xoxb-fake',
            appId: 'A123',
            botUserId: 'U-BOT',
            workspaceId: 'T123',
            workspaceName: 'Sandbox',
            transport: 'socket-mode',
            audience: 'dm',
        },
    };

    describe('constructor', () => {
        it('should use default path when no configPath provided', async () => {
            const defaultStore = new ChannelConfigRepository();
            // Should not throw — just uses default path
            const config = await defaultStore.getConfig();
            expect(config).toBeDefined();
        });
    });

    describe('getConfig', () => {
        it('narrows provider configuration from the channel type', () => {
            expect(isSlackEntry(slackEntry)).toBe(true);
            if (!isSlackEntry(slackEntry)) throw new Error('expected Slack entry');
            expect(slackEntry.config.workspaceId).toBe('T123');
        });

        it('should return default empty config when file does not exist', async () => {
            const config = await store.getConfig();
            expect(config).toEqual({ channels: {} });
        });

        it('should return parsed config when file exists', async () => {
            fs.writeFileSync(configPath, JSON.stringify({
                channels: { telegram: sampleEntry }
            }));

            const config = await store.getConfig();
            expect(config.channels.telegram).toEqual(sampleEntry);
        });

        it('should handle corrupted JSON gracefully', async () => {
            fs.writeFileSync(configPath, 'not valid json{{{');

            const config = await store.getConfig();
            expect(config).toEqual({ channels: {} });
        });
    });

    describe('saveChannel', () => {
        it('should create config file with channel entry', async () => {
            await store.saveChannel('telegram', sampleEntry);

            const raw = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(raw);
            expect(config.channels.telegram).toEqual(sampleEntry);
        });

        it('should create parent directory if missing', async () => {
            const nestedPath = path.join(tmpDir, 'nested', 'dir', 'channels.json');
            const nestedStore = new ChannelConfigRepository(nestedPath);

            await nestedStore.saveChannel('telegram', sampleEntry);

            expect(fs.existsSync(nestedPath)).toBe(true);
        });

        it('should set file permissions to 0600', async () => {
            await store.saveChannel('telegram', sampleEntry);

            const stats = fs.statSync(configPath);
            const mode = (stats.mode & 0o777).toString(8);
            expect(mode).toBe('600');
        });

        it('should repair permissive permissions on an existing config file', async () => {
            fs.writeFileSync(configPath, JSON.stringify({ channels: {} }), { mode: 0o644 });
            fs.chmodSync(configPath, 0o644);

            await store.saveChannel('slack', slackEntry);

            expect(fs.statSync(configPath).mode & 0o777).toBe(0o600);
        });

        it('should preserve existing channels when adding a new one', async () => {
            await store.saveChannel('telegram', sampleEntry);
            await store.saveChannel('slack', slackEntry);

            const config = await store.getConfig();
            expect(Object.keys(config.channels)).toEqual(['telegram', 'slack']);
            expect(config.channels.slack).toEqual(slackEntry);
        });

        it('should preserve separate Telegram configs by channel name', async () => {
            await store.saveChannel('personal', {
                ...sampleEntry,
                config: {
                    botToken: 'personal-token',
                    botUsername: 'personal_bot',
                    authorizedChatId: 111,
                },
            });
            await store.saveChannel('work', {
                ...sampleEntry,
                config: {
                    botToken: 'work-token',
                    botUsername: 'work_bot',
                    authorizedChatId: 222,
                },
            });

            const config = await store.getConfig();
            expect(config.channels.personal.config).toEqual({
                botToken: 'personal-token',
                botUsername: 'personal_bot',
                authorizedChatId: 111,
            });
            expect(config.channels.work.config).toEqual({
                botToken: 'work-token',
                botUsername: 'work_bot',
                authorizedChatId: 222,
            });
        });
    });

    describe('removeChannel', () => {
        it('should remove a channel entry', async () => {
            await store.saveChannel('telegram', sampleEntry);
            await store.removeChannel('telegram');

            const config = await store.getConfig();
            expect(config.channels.telegram).toBeUndefined();
        });

        it('should not throw when removing non-existent channel', async () => {
            await expect(store.removeChannel('nonexistent')).resolves.toBeUndefined();
        });
    });

    describe('getChannel', () => {
        it('should return the channel entry', async () => {
            await store.saveChannel('telegram', sampleEntry);

            const entry = await store.getChannel('telegram');
            expect(entry).toEqual(sampleEntry);
        });

        it('should return undefined for non-existent channel', async () => {
            const entry = await store.getChannel('slack');
            expect(entry).toBeUndefined();
        });
    });
});
