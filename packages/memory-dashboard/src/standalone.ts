import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, isAbsolute, join, resolve } from 'path';
import { Command } from 'commander';
import { createMemoryDashboardAction } from './command.js';

interface StandaloneRuntimeOptions {
  homeDir?: string;
  dbPathOverride?: string;
}

interface AiDevkitConfig {
  memory?: {
    path?: unknown;
  };
}

export interface StandaloneDashboardOptions {
  host?: string;
  port?: string;
  open?: boolean;
  dbPath?: string;
}

export function createStandaloneMemoryRuntime(options: StandaloneRuntimeOptions = {}) {
  const homeDir = options.homeDir ?? homedir();
  const configPath = join(homeDir, '.ai-devkit', '.ai-devkit.json');
  const defaultDbPath = join(homeDir, '.ai-devkit', 'memory.db');

  return {
    async getMemoryDbPath(): Promise<string> {
      if (options.dbPathOverride && options.dbPathOverride.trim().length > 0) {
        return resolve(options.dbPathOverride.trim());
      }

      const config = await readAiDevkitConfig(configPath);
      const configuredPath = config.memory?.path;

      if (typeof configuredPath !== 'string' || configuredPath.trim().length === 0) {
        return defaultDbPath;
      }

      const trimmedPath = configuredPath.trim();
      return isAbsolute(trimmedPath)
        ? trimmedPath
        : resolve(dirname(configPath), trimmedPath);
    },
    logger: {
      info(message: string): void {
        console.log(message);
      },
      warn(message: string): void {
        console.warn(message);
      },
    },
  };
}

export function parseStandaloneOptions(argv: string[]): StandaloneDashboardOptions {
  const command = createStandaloneCommand();
  command.exitOverride();
  command.configureOutput({
    writeOut: () => undefined,
    writeErr: () => undefined,
  });
  command.parse(['node', 'memory-dashboard-standalone', ...argv]);
  return command.opts<StandaloneDashboardOptions>();
}

export function createStandaloneCommand(): Command {
  return new Command('memory-dashboard-standalone')
    .description('Launch the AI DevKit memory dashboard without installing it as a plugin')
    .option('--host <host>', 'Host interface to bind', '127.0.0.1')
    .option('--port <port>', 'Port to bind, or 0 for a random free port', '0')
    .option('--db-path <path>', 'Memory database path override')
    .option('--open', 'Open the dashboard URL in the browser');
}

export async function runStandalone(argv: string[] = process.argv.slice(2)): Promise<void> {
  const command = createStandaloneCommand();
  command.parse(argv, { from: 'user' });
  const options = command.opts<StandaloneDashboardOptions>();
  const runtime = createStandaloneMemoryRuntime({ dbPathOverride: options.dbPath });
  await createMemoryDashboardAction(runtime)({
    host: options.host,
    port: options.port,
    open: options.open,
  });
}

async function readAiDevkitConfig(configPath: string): Promise<AiDevkitConfig> {
  try {
    return JSON.parse(await readFile(configPath, 'utf8')) as AiDevkitConfig;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStandalone().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
