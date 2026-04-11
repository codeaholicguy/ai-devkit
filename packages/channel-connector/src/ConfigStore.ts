import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ChannelConfig, ChannelEntry } from './types';

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.ai-devkit', 'channels.json');
const DEFAULT_CONFIG: ChannelConfig = { channels: {} };

/**
 * Persists channel configurations to disk.
 * Default location: ~/.ai-devkit/channels.json
 * File permissions are set to 0600 to protect tokens.
 */
export class ConfigStore {
    private configPath: string;

    constructor(configPath?: string) {
        this.configPath = configPath ?? DEFAULT_CONFIG_PATH;
    }

    /**
     * Read the full config. Returns default empty config if file is missing or corrupt.
     */
    async getConfig(): Promise<ChannelConfig> {
        try {
            const raw = fs.readFileSync(this.configPath, 'utf-8');
            return JSON.parse(raw) as ChannelConfig;
        } catch {
            return { ...DEFAULT_CONFIG, channels: {} };
        }
    }

    /**
     * Save a channel entry. Creates the file and parent directory if needed.
     */
    async saveChannel(name: string, entry: ChannelEntry): Promise<void> {
        const config = await this.getConfig();
        config.channels[name] = entry;
        await this.writeConfig(config);
    }

    /**
     * Remove a channel entry by name.
     */
    async removeChannel(name: string): Promise<void> {
        const config = await this.getConfig();
        delete config.channels[name];
        await this.writeConfig(config);
    }

    /**
     * Get a single channel entry by name.
     */
    async getChannel(name: string): Promise<ChannelEntry | undefined> {
        const config = await this.getConfig();
        return config.channels[name];
    }

    private async writeConfig(config: ChannelConfig): Promise<void> {
        const dir = path.dirname(this.configPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    }
}
