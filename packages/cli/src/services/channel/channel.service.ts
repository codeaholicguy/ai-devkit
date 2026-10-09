import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import type { ChannelConfig, TelegramConfig } from "@ai-devkit/channel-connector";
import { DaemonClient, ensureDaemon } from "@ai-devkit/daemon-client";

const DEFAULT_REGISTRY_PATH = path.join(os.homedir(), ".ai-devkit", "channel-bridges.json");
const BRIDGE_REGISTRY_SCOPE = "channel-bridges";
const DEFAULT_TELEGRAM_CHANNEL_NAME = "telegram";
const CHANNEL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export interface ChannelBridgeProcess {
  channelName: string;
  channelType: string;
  agentName: string;
  agentPid: number;
  bridgePid: number;
  startedAt: string;
  logPath?: string;
}

interface ChannelBridgeFile {
  bridges: Record<string, ChannelBridgeProcess>;
}

type PidChecker = (pid: number) => boolean;
type DetachedSpawner = (
  command: string,
  args: string[],
  options: { cwd: string; detached: true; stdio: ["ignore", number, number] },
) => { pid?: number; unref: () => void };
type ProcessKiller = (pid: number, signal: NodeJS.Signals) => void;

export interface StartDaemonBridgeInput {
  channelName: string;
  channelType: string;
  agentName: string;
  command: string;
  args: string[];
  cwd: string;
}

export interface StopBridgeResult {
  stopped: boolean;
  bridge?: ChannelBridgeProcess;
}

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
    private readonly spawnDetached: DetachedSpawner = (command, args, options) =>
      spawn(command, args, options),
    private readonly killProcess: ProcessKiller = (pid, signal) => {
      process.kill(pid, signal);
    },
  ) {}

  resolveConnectChannelName(name: string | undefined): string {
    const channelName = (name ?? DEFAULT_TELEGRAM_CHANNEL_NAME).trim();
    if (!CHANNEL_NAME_PATTERN.test(channelName)) {
      throw new Error(
        "Channel name must be kebab-case using lowercase letters, numbers, and hyphens.",
      );
    }
    return channelName;
  }

  assertUniqueTelegramToken(config: ChannelConfig, targetName: string, botToken: string): void {
    for (const [name, entry] of Object.entries(config.channels)) {
      if (name === targetName || entry.type !== DEFAULT_TELEGRAM_CHANNEL_NAME) continue;
      const telegramConfig = entry.config as TelegramConfig;
      if (telegramConfig.botToken === botToken) {
        throw new Error(`Telegram bot token is already configured for channel "${name}".`);
      }
    }
  }

  resolveStartChannelName(config: ChannelConfig, name: string | undefined): string {
    if (name !== undefined) return this.resolveConnectChannelName(name);

    const telegramChannels = Object.entries(config.channels)
      .filter(([, entry]) => entry.type === DEFAULT_TELEGRAM_CHANNEL_NAME)
      .map(([channelName]) => channelName);

    if (telegramChannels.length === 1) return telegramChannels[0];
    if (telegramChannels.length > 1) {
      throw new Error(
        `Multiple Telegram channels configured. Specify one: ${telegramChannels.join(", ")}`,
      );
    }
    throw new Error(
      'No Telegram channel configured. Run "ai-devkit channel connect telegram" first.',
    );
  }

  async getLiveBridges(): Promise<ChannelBridgeProcess[]> {
    const bridges = await this.listBridges();
    return bridges.filter((bridge) => this.isPidAlive(bridge.bridgePid));
  }

  async getLiveBridgeByChannel(channelName: string): Promise<ChannelBridgeProcess | undefined> {
    const liveBridges = await this.getLiveBridges();
    return liveBridges.find((bridge) => bridge.channelName === channelName);
  }

  async registerBridge(processInfo: ChannelBridgeProcess): Promise<void> {
    const client = await this.client();
    if (client) {
      try {
        await client.request("registry.put", {
          scope: BRIDGE_REGISTRY_SCOPE,
          name: processInfo.channelName,
          value: processInfo,
        });
        return;
      } catch {
        /* fall through to file */
      } finally {
        client.close();
      }
    }
    const registry = await this.readBridgeRegistry();
    registry.bridges[processInfo.channelName] = processInfo;
    await this.writeBridgeRegistry(registry);
  }

  async startDaemonBridge(input: StartDaemonBridgeInput): Promise<ChannelBridgeProcess> {
    const runningBridge = await this.getLiveBridgeByChannel(input.channelName);
    if (runningBridge) {
      throw new Error(
        `Channel "${input.channelName}" bridge is already running (PID: ${runningBridge.bridgePid}).`,
      );
    }

    const logPath = this.getBridgeLogPath(input.channelName);
    const logFd = this.openBridgeLog(input, logPath);
    let child: { pid?: number; unref: () => void };
    try {
      child = this.spawnDetached(input.command, input.args, {
        cwd: input.cwd,
        detached: true,
        stdio: ["ignore", logFd, logFd],
      });
    } finally {
      fs.closeSync(logFd);
    }

    if (!child.pid) {
      throw new Error("Failed to start channel bridge daemon: child process did not report a PID.");
    }

    child.unref();

    const bridge: ChannelBridgeProcess = {
      channelName: input.channelName,
      channelType: input.channelType,
      agentName: input.agentName,
      agentPid: 0,
      bridgePid: child.pid,
      startedAt: new Date().toISOString(),
      logPath,
    };

    await this.registerBridge(bridge);
    return bridge;
  }

  async stopBridge(channelName?: string): Promise<StopBridgeResult> {
    const liveBridges = await this.getLiveBridges();

    if (liveBridges.length === 0) {
      return { stopped: false };
    }

    let bridge: ChannelBridgeProcess | undefined;
    if (channelName) {
      bridge = liveBridges.find(
        (candidate) => candidate.channelName === this.resolveConnectChannelName(channelName),
      );
      if (!bridge) {
        return { stopped: false };
      }
    } else if (liveBridges.length === 1) {
      bridge = liveBridges[0];
    } else {
      throw new Error(
        `Multiple channel bridges are running. Specify one: ${liveBridges.map((candidate) => candidate.channelName).join(", ")}`,
      );
    }

    this.killProcess(bridge.bridgePid, "SIGTERM");
    await this.unregisterBridge(bridge.channelName);

    return { stopped: true, bridge };
  }

  async unregisterBridge(channelName: string): Promise<void> {
    const client = await this.client();
    if (client) {
      try {
        await client.request("registry.delete", {
          scope: BRIDGE_REGISTRY_SCOPE,
          name: channelName,
        });
        await this.pruneDeadBridges(client);
        return;
      } catch {
        /* fall through to file */
      } finally {
        client.close();
      }
    }
    const registry = await this.readBridgeRegistry();
    delete registry.bridges[channelName];
    this.pruneFileRegistry(registry);
    await this.writeBridgeRegistry(registry);
  }

  /**
   * Lazily get a daemon client; null when the daemon can't be spawned.
   * Connections are scoped to a single request — a cached client would pin
   * the event loop in short-lived commands and the agent console.
   */
  private client(): Promise<DaemonClient | null> {
    // Daemon path is skipped when a custom registryPath was injected (tests,
    // alternate profiles) — those callers want file semantics.
    if (this.registryPath !== DEFAULT_REGISTRY_PATH) return Promise.resolve(null);
    return ensureDaemon().catch(() => null);
  }

  private async listBridges(): Promise<ChannelBridgeProcess[]> {
    const client = await this.client();
    if (client) {
      try {
        const result = (await client.request("registry.get", {
          scope: BRIDGE_REGISTRY_SCOPE,
        })) as Record<string, ChannelBridgeProcess>;
        return this.mergeFileBridges(Object.values(result ?? {}));
      } catch {
        /* fall through to file */
      } finally {
        client.close();
      }
    }
    return Object.values((await this.readBridgeRegistry()).bridges);
  }

  // Read-time union so a bridge registered under the old file scheme stays
  // visible and stoppable during transition. The file is never written on
  // this path — stale entries age out as their pids die.
  private async mergeFileBridges(
    bridges: ChannelBridgeProcess[],
  ): Promise<ChannelBridgeProcess[]> {
    const seen = new Set(bridges.map((b) => b.channelName));
    const file = await this.readBridgeRegistry();
    for (const [name, bridge] of Object.entries(file.bridges)) {
      if (!seen.has(name)) bridges.push(bridge);
    }
    return bridges;
  }

  private async pruneDeadBridges(client: DaemonClient): Promise<void> {
    try {
      const result = (await client.request("registry.get", {
        scope: BRIDGE_REGISTRY_SCOPE,
      })) as Record<string, ChannelBridgeProcess>;
      for (const [name, bridge] of Object.entries(result ?? {})) {
        if (!this.isPidAlive(bridge.bridgePid)) {
          await client.request("registry.delete", { scope: BRIDGE_REGISTRY_SCOPE, name });
        }
      }
    } catch {
      /* pruning is best-effort */
    }
  }

  private pruneFileRegistry(registry: ChannelBridgeFile): void {
    for (const [name, bridge] of Object.entries(registry.bridges)) {
      if (!this.isPidAlive(bridge.bridgePid)) delete registry.bridges[name];
    }
  }

  private async readBridgeRegistry(): Promise<ChannelBridgeFile> {
    try {
      const raw = fs.readFileSync(this.registryPath, "utf-8");
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

  private getBridgeLogPath(channelName: string): string {
    return path.join(path.dirname(this.registryPath), "channel-logs", `${channelName}.log`);
  }

  private openBridgeLog(input: StartDaemonBridgeInput, logPath: string): number {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const logFd = fs.openSync(logPath, "a", 0o600);
    fs.writeSync(
      logFd,
      `[${new Date().toISOString()}] Starting channel daemon: ${input.channelName} -> ${input.agentName}\n`,
    );
    fs.writeSync(logFd, `[command] ${input.command} ${input.args.join(" ")}\n`);
    return logFd;
  }
}
