import type { Command } from 'commander';
import { createPluginManager } from '../services/plugin/plugin-manager.service.js';
import { ui } from '../util/terminal-ui.js';
import { withErrorHandler } from '../util/errors.js';

export function registerPluginCommand(program: Command): void {
  const manager = createPluginManager();
  const pluginCommand = program
    .command('plugin')
    .description('Manage global AI DevKit plugins');

  pluginCommand
    .command('add <package>')
    .description('Install and enable a global npm plugin')
    .action(withErrorHandler('add plugin', async (pluginPackage: string) => {
      await manager.add(pluginPackage);
      ui.success(`Plugin added: ${pluginPackage}`);
    }));

  pluginCommand
    .command('remove <package>')
    .description('Uninstall and disable a global npm plugin')
    .action(withErrorHandler('remove plugin', async (pluginPackage: string) => {
      await manager.remove(pluginPackage);
      ui.success(`Plugin removed: ${pluginPackage}`);
    }));

  pluginCommand
    .command('list')
    .description('List configured global plugins')
    .action(withErrorHandler('list plugins', async () => {
      const plugins = await manager.list();

      if (plugins.length === 0) {
        ui.warning('No global plugins configured.');
        return;
      }

      ui.table({
        headers: ['package', 'status', 'error'],
        rows: plugins.map(plugin => [
          plugin.name,
          plugin.status,
          plugin.error ?? ''
        ])
      });
    }));
}
