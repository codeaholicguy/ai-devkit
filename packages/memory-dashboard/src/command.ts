import type { Command } from 'commander';
import { spawn } from 'child_process';
import { startDashboardServer } from './server.js';

interface AiDevkitRuntime {
  getMemoryDbPath(): Promise<string>;
  logger: {
    info(message: string): void;
    warn?(message: string): void;
  };
}

export interface MemoryDashboardOptions {
  host?: string;
  port?: string;
  open?: boolean;
}

export interface DashboardServerOptions {
  dbPath: string;
  host: string;
  port: number;
}

export interface DashboardServerHandle {
  url: string;
  close(): void | Promise<void>;
}

interface MemoryDashboardActionDeps {
  startServer?: (options: DashboardServerOptions) => Promise<DashboardServerHandle>;
  openUrl?: (url: string) => Promise<void>;
}

export function register(
  command: Command,
  runtime: AiDevkitRuntime,
  deps: MemoryDashboardActionDeps = {}
): void {
  command
    .description('Launch the local AI DevKit memory dashboard')
    .option('--host <host>', 'Host interface to bind', '127.0.0.1')
    .option('--port <port>', 'Port to bind, or 0 for a random free port', '0')
    .option('--open', 'Open the dashboard URL in the browser')
    .action(createMemoryDashboardAction(runtime, deps));
}

export function createMemoryDashboardAction(
  runtime: AiDevkitRuntime,
  deps: MemoryDashboardActionDeps = {}
): (options: MemoryDashboardOptions) => Promise<void> {
  const startServer = deps.startServer ?? startDashboardServer;
  const openUrl = deps.openUrl ?? openBrowser;

  return async (options: MemoryDashboardOptions): Promise<void> => {
    const dbPath = await runtime.getMemoryDbPath();
    const host = options.host ?? '127.0.0.1';
    const port = parsePort(options.port ?? '0');
    const server = await startServer({ dbPath, host, port });

    runtime.logger.info(`Memory dashboard: ${server.url}`);

    if (options.open) {
      try {
        await openUrl(server.url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        runtime.logger.warn?.(`Unable to open browser automatically: ${message}. Open the printed URL manually.`);
      }
    }
  };
}

function parsePort(rawPort: string): number {
  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('Port must be an integer between 0 and 65535.');
  }

  return port;
}

async function openBrowser(url: string): Promise<void> {
  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = process.platform === 'win32'
    ? ['/c', 'start', '', url]
    : [url];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
