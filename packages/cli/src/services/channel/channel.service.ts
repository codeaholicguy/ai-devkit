import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    TELEGRAM_CHANNEL_TYPE,
    type ChannelConfig,
    type TelegramConfig,
} from '@ai-devkit/channel-connector';

const DEFAULT_REGISTRY_PATH = path.join(os.homedir(), '.ai-devkit', 'channel-bridges.json');
const DEFAULT_TELEGRAM_CHANNEL_NAME = TELEGRAM_CHANNEL_TYPE;
const CHANNEL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export interface ChannelBridgeProcess {
    channelName: string;
    channelType: string;
    agentName: string;
    agentPid: number;
    bridgePid: number;
    startedAt: string;
}

interface ChannelBridgeFile {
    bridges: Record<string, ChannelBridgeProcess>;
}

type PidChecker = (pid: number) => boolean;

function defaultPidChecker(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

export class ChannelService {
    constructor(
        private readonly registryPath = DEFAULT_REGISTRY_PATH,
        private readonly isPidAlive: PidChecker = defaultPidChecker,
    ) {}

    resolveConnectChannelName(name: string | undefined): string {
        const channelName = (name ?? DEFAULT_TELEGRAM_CHANNEL_NAME).trim();
        if (!CHANNEL_NAME_PATTERN.test(channelName)) {
            throw new Error('Channel name must be kebab-case using lowercase letters, numbers, and hyphens.');
        }
        return channelName;
    }

    assertUniqueTelegramToken(config: ChannelConfig, targetName: string, botToken: string): void {
        for (const [name, entry] of Object.entries(config.channels)) {
            if (name === targetName || entry.type !== TELEGRAM_CHANNEL_TYPE) continue;
            const telegramConfig = entry.config as TelegramConfig;
            if (telegramConfig.botToken === botToken) {
                throw new Error(`Telegram bot token is already configured for channel "${name}".`);
            }
        }
    }

    resolveStartChannelName(config: ChannelConfig, name: string | undefined): string {
        if (name !== undefined) return this.resolveConnectChannelName(name);

        const telegramChannels = Object.entries(config.channels)
            .filter(([, entry]) => entry.type === TELEGRAM_CHANNEL_TYPE)
            .map(([channelName]) => channelName);

        if (telegramChannels.length === 1) return telegramChannels[0];
        if (telegramChannels.length > 1) {
            throw new Error(`Multiple Telegram channels configured. Specify one: ${telegramChannels.join(', ')}`);
        }
        throw new Error('No Telegram channel configured. Run "ai-devkit channel connect telegram" first.');
    }

    async getLiveBridges(): Promise<ChannelBridgeProcess[]> {
        const registry = await this.readBridgeRegistry();
        const liveEntries = Object.entries(registry.bridges)
            .filter(([, bridge]) => this.isPidAlive(bridge.bridgePid));

        const next: ChannelBridgeFile = { bridges: Object.fromEntries(liveEntries) };
        await this.writeBridgeRegistry(next);
        return Object.values(next.bridges);
    }

    async getLiveBridgeByChannel(channelName: string): Promise<ChannelBridgeProcess | undefined> {
        const liveBridges = await this.getLiveBridges();
        return liveBridges.find(bridge => bridge.channelName === channelName);
    }

    async registerBridge(processInfo: ChannelBridgeProcess): Promise<void> {
        const registry = await this.readBridgeRegistry();
        registry.bridges[processInfo.channelName] = processInfo;
        await this.writeBridgeRegistry(registry);
    }

    async unregisterBridge(channelName: string): Promise<void> {
        const registry = await this.readBridgeRegistry();
        delete registry.bridges[channelName];
        await this.writeBridgeRegistry(registry);
    }

    private async readBridgeRegistry(): Promise<ChannelBridgeFile> {
        try {
            const raw = fs.readFileSync(this.registryPath, 'utf-8');
            return JSON.parse(raw) as ChannelBridgeFile;
        } catch {
            return { bridges: {} };
        }
    }

    private async writeBridgeRegistry(registry: ChannelBridgeFile): Promise<void> {
        const dir = path.dirname(this.registryPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.registryPath, JSON.stringify(registry, null, 2), { mode: 0o600 });
    }
}
