import { Command } from 'commander';
import fs from 'fs-extra';
import type { Mocked } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import {
  getInstalledPluginPackageJsonPath,
  loadInstalledPluginCommands,
  registerConfiguredPluginCommands,
  type LoadedPluginCommand,
} from '../../../services/plugin/plugin-loader.service.js';

vi.mock('os');

describe('plugin loader service', () => {
  let tempHome: string;
  let mockOs: Mocked<typeof os>;

  beforeEach(async () => {
    mockOs = os as Mocked<typeof os>;
    tempHome = await fs.mkdtemp('/tmp/ai-devkit-plugin-loader-');
    mockOs.homedir.mockReturnValue(tempHome);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fs.remove(tempHome);
  });

  it('builds package.json paths directly under the global plugin node_modules', () => {
    expect(getInstalledPluginPackageJsonPath('@ai-devkit/memory-dashboard'))
      .toContain('.ai-devkit/npm/node_modules/@ai-devkit/memory-dashboard/package.json');
  });

  it('loads installed plugin commands when declared entrypoints exist', async () => {
    const pluginRoot = path.join(tempHome, '.ai-devkit', 'npm', 'node_modules', '@ai-devkit', 'memory-dashboard');
    await fs.ensureDir(path.join(pluginRoot, 'dist'));
    await fs.writeJson(path.join(pluginRoot, 'package.json'), {
      aiDevkit: {
        commands: [
          {
            name: 'memory-dashboard',
            description: 'Open memory dashboard',
            entry: './dist/command.js',
          }
        ]
      }
    });
    await fs.writeFile(path.join(pluginRoot, 'dist', 'command.js'), 'export function register() {}');

    await expect(loadInstalledPluginCommands('@ai-devkit/memory-dashboard')).resolves.toEqual([
      {
        pluginName: '@ai-devkit/memory-dashboard',
        command: {
          name: 'memory-dashboard',
          description: 'Open memory dashboard',
          entry: './dist/command.js',
          entryPath: path.join(pluginRoot, 'dist', 'command.js'),
        }
      }
    ]);
  });

  it('rejects installed plugin commands when declared entrypoints are missing', async () => {
    const pluginRoot = path.join(tempHome, '.ai-devkit', 'npm', 'node_modules', '@ai-devkit', 'memory-dashboard');
    await fs.ensureDir(pluginRoot);
    await fs.writeJson(path.join(pluginRoot, 'package.json'), {
      aiDevkit: {
        commands: [
          {
            name: 'memory-dashboard',
            entry: './dist/missing.js',
          }
        ]
      }
    });

    await expect(loadInstalledPluginCommands('@ai-devkit/memory-dashboard'))
      .rejects.toThrow('Plugin @ai-devkit/memory-dashboard command "memory-dashboard" entrypoint does not exist: ./dist/missing.js');
  });

  it('rejects unsafe configured plugin names before building package paths', () => {
    expect(() => getInstalledPluginPackageJsonPath('@ai-devkit/../memory-dashboard'))
      .toThrow('Only npm package names are supported for plugins.');
  });

  it('registers configured plugin commands with Commander', async () => {
    const program = new Command();
    const runtime = {
      cwd: '/project',
      homeDir: '/home/test',
      configPath: '/home/test/.ai-devkit/.ai-devkit.json',
      getConfig: vi.fn(),
      getMemoryDbPath: vi.fn(),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }
    };
    const loadedCommand: LoadedPluginCommand = {
      pluginName: '@ai-devkit/memory-dashboard',
      command: {
        name: 'memory-dashboard',
        description: 'Open memory dashboard',
        entry: './dist/command.js',
        entryPath: '/plugin/dist/command.js',
      }
    };

    await registerConfiguredPluginCommands(program, runtime, {
      getPlugins: vi.fn().mockResolvedValue(['@ai-devkit/memory-dashboard']),
      loadPluginCommands: vi.fn().mockResolvedValue([loadedCommand]),
      importCommandEntry: vi.fn().mockResolvedValue({
        register(command: Command, receivedRuntime: typeof runtime) {
          command
            .option('--port <port>')
            .action(() => {
              receivedRuntime.logger.info('dashboard started');
            });
        }
      }),
      warn: vi.fn(),
    });

    await program.parseAsync(['node', 'test', 'memory-dashboard', '--port', '3030']);

    expect(runtime.logger.info).toHaveBeenCalledWith('dashboard started');
  });

  it('warns and continues when a configured plugin fails to load', async () => {
    const program = new Command();
    const warn = vi.fn();

    await registerConfiguredPluginCommands(program, {} as any, {
      getPlugins: vi.fn().mockResolvedValue(['@ai-devkit/bad-plugin']),
      loadPluginCommands: vi.fn().mockRejectedValue(new Error('missing manifest')),
      importCommandEntry: vi.fn(),
      warn,
    });

    expect(warn).toHaveBeenCalledWith('Failed to load plugin @ai-devkit/bad-plugin: missing manifest');
  });

  it('leaves existing built-in commands available when a configured plugin fails to load', async () => {
    const program = new Command();
    const builtInAction = vi.fn();
    program.command('memory').action(builtInAction);

    await registerConfiguredPluginCommands(program, {} as any, {
      getPlugins: vi.fn().mockResolvedValue(['@ai-devkit/bad-plugin']),
      loadPluginCommands: vi.fn().mockRejectedValue(new Error('missing manifest')),
      importCommandEntry: vi.fn(),
      warn: vi.fn(),
    });

    await program.parseAsync(['node', 'test', 'memory']);

    expect(builtInAction).toHaveBeenCalled();
  });

  it('rejects plugin entrypoints that do not export register()', async () => {
    const program = new Command();
    const loadedCommand: LoadedPluginCommand = {
      pluginName: '@ai-devkit/bad-plugin',
      command: {
        name: 'bad-plugin',
        entry: './dist/command.js',
        entryPath: '/plugin/dist/command.js',
      }
    };

    await expect(registerConfiguredPluginCommands(program, {} as any, {
      getPlugins: vi.fn().mockResolvedValue(['@ai-devkit/bad-plugin']),
      loadPluginCommands: vi.fn().mockResolvedValue([loadedCommand]),
      importCommandEntry: vi.fn().mockResolvedValue({}),
      warn: vi.fn(),
    })).resolves.toBeUndefined();

    expect(program.commands.find(command => command.name() === 'bad-plugin')).toBeUndefined();
  });

  it('warns and skips plugin commands that conflict with already registered commands', async () => {
    const program = new Command();
    program.command('memory').action(vi.fn());
    const warn = vi.fn();
    const importCommandEntry = vi.fn();
    const loadedCommand: LoadedPluginCommand = {
      pluginName: '@ai-devkit/conflict-plugin',
      command: {
        name: 'memory',
        entry: './dist/command.js',
        entryPath: '/plugin/dist/command.js',
      }
    };

    await registerConfiguredPluginCommands(program, {} as any, {
      getPlugins: vi.fn().mockResolvedValue(['@ai-devkit/conflict-plugin']),
      loadPluginCommands: vi.fn().mockResolvedValue([loadedCommand]),
      importCommandEntry,
      warn,
    });

    expect(warn).toHaveBeenCalledWith('Plugin @ai-devkit/conflict-plugin command "memory" conflicts with an already registered command.');
    expect(importCommandEntry).not.toHaveBeenCalled();
    expect(program.commands.filter(command => command.name() === 'memory')).toHaveLength(1);
  });
});
