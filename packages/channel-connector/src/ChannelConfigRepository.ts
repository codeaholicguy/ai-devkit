import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { ChannelConfig, ChannelEntry } from "./types.js";
import { DaemonClient, ensureDaemon } from "@ai-devkit/daemon-client";

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".ai-devkit", "channels.json");
const DEFAULT_CONFIG: ChannelConfig = { channels: {} };

/**
 * Persists channel configurations.
 *
 * Daemon-first: when ai-devkitd is reachable (auto-spawned if the binary is
 * present), registry writes go through the daemon's sole-writer SQLite store,
 * which eliminates the read-modify-write races this JSON file had.
 * Fallback: the original ~/.ai-devkit/channels.json behavior is preserved so
 * environments without the daemon binary degrade transparently.
 */
export class ChannelConfigRepository {
  private configPath: string;
  private clientPromise: Promise<DaemonClient | null> | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath ?? DEFAULT_CONFIG_PATH;
  }

  /** Lazily get a daemon client; null when the daemon can't be spawned. */
  private client(): Promise<DaemonClient | null> {
    // Daemon path is skipped when a custom configPath was injected (tests,
    // alternate profiles) — those callers want file semantics.
    if (this.configPath !== DEFAULT_CONFIG_PATH) return Promise.resolve(null);
    this.clientPromise ??= ensureDaemon().catch(() => null);
    return this.clientPromise;
  }

  /**
   * Read the full config. Returns default empty config if file is missing or corrupt.
   */
  async getConfig(): Promise<ChannelConfig> {
    const client = await this.client();
    if (client) {
      try {
        const result = (await client.request("registry.get", {
          scope: "channels",
        })) as Record<string, ChannelEntry>;
        return { channels: result ?? {} };
      } catch {
        /* fall through to file */
      }
    }
    try {
      const raw = fs.readFileSync(this.configPath, "utf-8");
      return JSON.parse(raw) as ChannelConfig;
    } catch {
      return { ...DEFAULT_CONFIG, channels: {} };
    }
  }

  /**
   * Save a channel entry. Creates the file and parent directory if needed.
   */
  async saveChannel(name: string, entry: ChannelEntry): Promise<void> {
    const client = await this.client();
    if (client) {
      try {
        await client.request("registry.put", {
          scope: "channels",
          name,
          value: entry,
        });
        return;
      } catch {
        /* fall through to file */
      }
    }
    const config = await this.getConfig();
    config.channels[name] = entry;
    await this.writeConfig(config);
  }

  /**
   * Remove a channel entry by name.
   */
  async removeChannel(name: string): Promise<void> {
    const client = await this.client();
    if (client) {
      try {
        await client.request("registry.delete", {
          scope: "channels",
          name,
        });
        return;
      } catch {
        /* fall through to file */
      }
    }
    const config = await this.getConfig();
    delete config.channels[name];
    await this.writeConfig(config);
  }

  /**
   * Get a single channel entry by name.
   */
  async getChannel(name: string): Promise<ChannelEntry | undefined> {
    const client = await this.client();
    if (client) {
      try {
        const v = (await client.request("registry.get", {
          scope: "channels",
          name,
        })) as ChannelEntry | null;
        return v ?? undefined;
      } catch {
        /* fall through to file */
      }
    }
    const config = await this.getConfig();
    return config.channels[name];
  }

  private async writeConfig(config: ChannelConfig): Promise<void> {
    const dir = path.dirname(this.configPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    fs.chmodSync(this.configPath, 0o600);
  }
}
