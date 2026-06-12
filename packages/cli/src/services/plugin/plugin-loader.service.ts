import fs from 'fs-extra';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { Command } from 'commander';
import { GlobalConfigManager } from '../../lib/GlobalConfig.js';
import { ValidationError } from '../../util/errors.js';
import { getErrorMessage } from '../../util/text.js';
import { ui } from '../../util/terminal-ui.js';
import { getGlobalPluginNpmRoot, validatePluginPackageName } from './plugin-package.service.js';
import {
  resolvePluginCommandEntry,
  validatePluginManifest,
  type AiDevkitPluginCommand,
} from './plugin-manifest.service.js';

export const BUILT_IN_COMMAND_NAMES = new Set([
  'init',
  'phase',
  'lint',
  'install',
  'memory',
  'skill',
  'agent',
  'channel',
  'docs',
  'plugin'
]);

export async function validateInstalledPluginManifest(pluginName: string): Promise<void> {
  await loadInstalledPluginCommands(pluginName);
}

export interface LoadedPluginCommand {
  pluginName: string;
  command: AiDevkitPluginCommand & {
    entryPath: string;
  };
}

export interface AiDevkitRuntime {
  cwd: string;
  homeDir: string;
  configPath: string;
  getConfig(): Promise<unknown>;
  getMemoryDbPath(): Promise<string>;
  logger: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
}

interface PluginCommandEntryModule {
  register?: (command: Command, runtime: AiDevkitRuntime) => void | Promise<void>;
}

interface RegisterConfiguredPluginCommandsDeps {
  getPlugins?: () => Promise<string[]>;
  loadPluginCommands?: (pluginName: string) => Promise<LoadedPluginCommand[]>;
  importCommandEntry?: (entryPath: string) => Promise<PluginCommandEntryModule>;
  warn?: (message: string) => void;
}

export async function registerConfiguredPluginCommands(
  program: Command,
  runtime: AiDevkitRuntime,
  deps: RegisterConfiguredPluginCommandsDeps = {}
): Promise<void> {
  const globalConfig = new GlobalConfigManager();
  const getPlugins = deps.getPlugins ?? (() => globalConfig.getPlugins());
  const loadPluginCommands = deps.loadPluginCommands ?? loadInstalledPluginCommands;
  const importCommandEntry = deps.importCommandEntry ?? defaultImportCommandEntry;
  const warn = deps.warn ?? ((message: string) => ui.warning(message));
  const plugins = await getPlugins();
  const registeredCommandNames = new Set(program.commands.map(command => command.name()));

  for (const pluginName of plugins) {
    try {
      const commands = await loadPluginCommands(pluginName);

      for (const loadedCommand of commands) {
        if (registeredCommandNames.has(loadedCommand.command.name)) {
          warn(`Plugin ${pluginName} command "${loadedCommand.command.name}" conflicts with an already registered command.`);
          continue;
        }

        const entryModule = await importCommandEntry(loadedCommand.command.entryPath);
        if (typeof entryModule.register !== 'function') {
          warn(`Plugin ${pluginName} command "${loadedCommand.command.name}" entrypoint must export register().`);
          continue;
        }

        const command = program
          .command(loadedCommand.command.name)
          .description(loadedCommand.command.description ?? `Plugin command from ${pluginName}`);

        await entryModule.register(command, runtime);
        registeredCommandNames.add(loadedCommand.command.name);
      }
    } catch (error) {
      warn(`Failed to load plugin ${pluginName}: ${getErrorMessage(error)}`);
    }
  }
}

export async function loadInstalledPluginCommands(pluginName: string): Promise<LoadedPluginCommand[]> {
  const packageJsonPath = getInstalledPluginPackageJsonPath(pluginName);
  const packageJson = await fs.readJson(packageJsonPath) as unknown;
  const pluginRoot = path.dirname(packageJsonPath);
  const manifest = validatePluginManifest(pluginName, packageJson, BUILT_IN_COMMAND_NAMES);
  const commands: LoadedPluginCommand[] = [];

  for (const command of manifest.commands) {
    const entryPath = resolvePluginCommandEntry(pluginRoot, command.entry);
    if (!await fs.pathExists(entryPath)) {
      throw new ValidationError(`Plugin ${pluginName} command "${command.name}" entrypoint does not exist: ${command.entry}`);
    }

    commands.push({
      pluginName,
      command: {
        ...command,
        entryPath
      }
    });
  }

  return commands;
}

export function getInstalledPluginPackageJsonPath(pluginName: string): string {
  const normalizedName = validatePluginPackageName(pluginName);
  return path.join(getGlobalPluginNpmRoot(), 'node_modules', normalizedName, 'package.json');
}

async function defaultImportCommandEntry(entryPath: string): Promise<PluginCommandEntryModule> {
  return import(pathToFileURL(entryPath).href) as Promise<PluginCommandEntryModule>;
}
