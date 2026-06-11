import * as path from 'path';
import { ValidationError } from '../../util/errors.js';

export interface AiDevkitPluginManifest {
  commands: AiDevkitPluginCommand[];
}

export interface AiDevkitPluginCommand {
  name: string;
  description?: string;
  entry: string;
}

const JAVASCRIPT_ENTRY_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export function validatePluginManifest(
  pluginName: string,
  packageJson: unknown,
  builtInCommandNames: Set<string>
): AiDevkitPluginManifest {
  const commands = readCommands(pluginName, packageJson);
  const seenCommands = new Set<string>();

  for (const command of commands) {
    if (seenCommands.has(command.name)) {
      throw new ValidationError(`Plugin ${pluginName} declares duplicate command "${command.name}".`);
    }

    seenCommands.add(command.name);

    if (builtInCommandNames.has(command.name)) {
      throw new ValidationError(`Plugin ${pluginName} command "${command.name}" conflicts with a built-in command.`);
    }

    if (!JAVASCRIPT_ENTRY_EXTENSIONS.has(path.extname(command.entry))) {
      throw new ValidationError(`Plugin ${pluginName} command "${command.name}" must point to a JavaScript entrypoint.`);
    }
  }

  return { commands };
}

export function resolvePluginCommandEntry(pluginRoot: string, entry: string): string {
  const resolvedEntry = path.resolve(pluginRoot, entry);
  const relativeEntry = path.relative(pluginRoot, resolvedEntry);

  if (relativeEntry.startsWith('..') || path.isAbsolute(relativeEntry)) {
    throw new ValidationError('Plugin command entry must resolve inside the plugin package root.');
  }

  return resolvedEntry;
}

function readCommands(pluginName: string, packageJson: unknown): AiDevkitPluginCommand[] {
  if (!packageJson || typeof packageJson !== 'object') {
    throw missingManifestError(pluginName);
  }

  const aiDevkit = (packageJson as { aiDevkit?: unknown }).aiDevkit;
  if (!aiDevkit || typeof aiDevkit !== 'object') {
    throw missingManifestError(pluginName);
  }

  const commands = (aiDevkit as { commands?: unknown }).commands;
  if (!Array.isArray(commands) || commands.length === 0) {
    throw missingManifestError(pluginName);
  }

  return commands.map((command, index) => normalizeCommand(pluginName, command, index));
}

function normalizeCommand(pluginName: string, command: unknown, index: number): AiDevkitPluginCommand {
  if (!command || typeof command !== 'object') {
    throw new ValidationError(`Plugin ${pluginName} command at index ${index} must be an object.`);
  }

  const rawCommand = command as Record<string, unknown>;
  const name = typeof rawCommand.name === 'string' ? rawCommand.name.trim() : '';
  const entry = typeof rawCommand.entry === 'string' ? rawCommand.entry.trim() : '';
  const description = typeof rawCommand.description === 'string'
    ? rawCommand.description.trim()
    : undefined;

  if (!name) {
    throw new ValidationError(`Plugin ${pluginName} command at index ${index} must define a name.`);
  }

  if (!COMMAND_NAME_PATTERN.test(name)) {
    throw new ValidationError(`Plugin ${pluginName} command "${name}" must use lowercase letters, numbers, and hyphens only, and start with a letter.`);
  }

  if (!entry) {
    throw new ValidationError(`Plugin ${pluginName} command "${name}" must define an entry.`);
  }

  return {
    name,
    ...(description ? { description } : {}),
    entry
  };
}

function missingManifestError(pluginName: string): ValidationError {
  return new ValidationError(`Plugin ${pluginName} must define package.json aiDevkit.commands.`);
}
