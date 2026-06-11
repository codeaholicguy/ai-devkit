import * as os from 'os';
import * as path from 'path';
import { GlobalConfigManager } from '../../lib/GlobalConfig.js';
import { ui } from '../../util/terminal-ui.js';
import type { GlobalDevKitConfig } from '../../types.js';
import type { AiDevkitRuntime } from './plugin-loader.service.js';

interface CreateRuntimeOptions {
  cwd?: string;
  configManager?: GlobalConfigManager;
}

export function createAiDevkitRuntime(options: CreateRuntimeOptions = {}): AiDevkitRuntime {
  const homeDir = os.homedir();
  const defaultMemoryDbPath = getDefaultMemoryDbPath(homeDir);
  const configPath = path.join(homeDir, '.ai-devkit', '.ai-devkit.json');
  const configManager = options.configManager ?? new GlobalConfigManager();

  return {
    cwd: options.cwd ?? process.cwd(),
    homeDir,
    configPath,
    async getConfig(): Promise<GlobalDevKitConfig> {
      return await configManager.read() ?? {};
    },
    async getMemoryDbPath(): Promise<string> {
      const config = await configManager.read();
      const configuredPath = config?.memory?.path;

      if (typeof configuredPath !== 'string' || configuredPath.trim().length === 0) {
        return defaultMemoryDbPath;
      }

      const trimmedPath = configuredPath.trim();
      if (path.isAbsolute(trimmedPath)) {
        return trimmedPath;
      }

      return path.resolve(path.dirname(configPath), trimmedPath);
    },
    logger: {
      info(message: string): void {
        ui.info(message);
      },
      warn(message: string): void {
        ui.warning(message);
      },
      error(message: string): void {
        ui.error(message);
      }
    }
  };
}

function getDefaultMemoryDbPath(homeDir: string): string {
  return path.join(homeDir, '.ai-devkit', 'memory.db');
}
