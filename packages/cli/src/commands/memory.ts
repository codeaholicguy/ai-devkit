import type { Command } from 'commander';
import {
  memoryDownloadSemanticCommand,
  memoryReembedCommand,
  memorySearchCommand,
  memorySearchCommandAsync,
  memorySemanticStatusCommand,
  memoryStoreCommand,
  memoryStoreCommandAsync,
  memoryUpdateCommand,
  memoryUpdateCommandAsync,
} from '@ai-devkit/memory';
import type { MemorySearchOptions, MemoryStoreOptions, MemoryUpdateOptions } from '@ai-devkit/memory';
import { ConfigManager } from '../lib/Config.js';
import { ui } from '../util/terminal-ui.js';
import { withErrorHandler } from '../util/errors.js';
import { truncate } from '../util/text.js';

const TITLE_MAX_LENGTH = 60;

export function registerMemoryCommand(program: Command): void {
  const resolveMemoryDbPath = async (): Promise<string | undefined> => {
    const configManager = new ConfigManager();
    return configManager.getMemoryDbPath();
  };

  const resolveSemanticEnabled = async (): Promise<boolean> => {
    const configManager = new ConfigManager();
    return configManager.getMemorySemanticEnabled();
  };

  const memoryCommand = program
    .command('memory')
    .description('Interact with the knowledge memory service');

  memoryCommand
    .command('store')
    .description('Store a new knowledge item')
    .requiredOption('-t, --title <title>', 'Title of the knowledge item (10-100 chars)')
    .requiredOption('-c, --content <content>', 'Content of the knowledge item (50-5000 chars)')
    .option('--tags <tags>', 'Comma-separated tags (e.g., "api,backend")')
    .option('-s, --scope <scope>', 'Scope: global, project:<name>, or repo:<name>', 'global')
    .action(withErrorHandler('store knowledge', async (options: MemoryStoreOptions) => {
      const commandOptions = {
        ...options,
        dbPath: await resolveMemoryDbPath()
      } as MemoryStoreOptions;
      const result = await resolveSemanticEnabled()
        ? await memoryStoreCommandAsync({ ...commandOptions, semantic: true })
        : memoryStoreCommand(commandOptions);
      console.log(JSON.stringify(result, null, 2));
    }));

  memoryCommand
    .command('update')
    .description('Update an existing knowledge item by ID')
    .requiredOption('--id <id>', 'ID of the knowledge item to update')
    .option('-t, --title <title>', 'New title (10-100 chars)')
    .option('-c, --content <content>', 'New content (50-5000 chars)')
    .option('--tags <tags>', 'Comma-separated new tags (replaces existing)')
    .option('-s, --scope <scope>', 'New scope: global, project:<name>, or repo:<name>')
    .action(withErrorHandler('update knowledge', async (options: MemoryUpdateOptions) => {
      const commandOptions = {
        ...options,
        dbPath: await resolveMemoryDbPath()
      } as MemoryUpdateOptions;
      const result = await resolveSemanticEnabled()
        ? await memoryUpdateCommandAsync({ ...commandOptions, semantic: true })
        : memoryUpdateCommand(commandOptions);
      console.log(JSON.stringify(result, null, 2));
    }));

  memoryCommand
    .command('search')
    .description('Search for knowledge items')
    .requiredOption('-q, --query <query>', 'Search query (3-500 chars)')
    .option('--tags <tags>', 'Comma-separated context tags to boost results')
    .option('-s, --scope <scope>', 'Scope filter')
    .option('-l, --limit <limit>', 'Maximum results (1-20)', '5')
    .option('--table', 'Display results as a table with id, title, and scope')
    .option('--explain', 'Include lexical and semantic rank details')
    .action(withErrorHandler('search knowledge', async (options: MemorySearchOptions & { limit?: string; table?: boolean; explain?: boolean }) => {
      const { table, limit, explain, ...searchOptions } = options;
      const commandOptions = {
        ...searchOptions,
        limit: limit ? parseInt(limit, 10) : 5,
        dbPath: await resolveMemoryDbPath(),
        ...(explain ? { explain: true } : {}),
      } as MemorySearchOptions;
      const result = await resolveSemanticEnabled()
        ? await memorySearchCommandAsync({ ...commandOptions, semantic: true })
        : memorySearchCommand(commandOptions);

      if (table) {
        if (result.results.length === 0) {
          ui.warning(`No memory items found matching "${result.query}"`);
          return;
        }

        ui.table({
          headers: ['id', 'title', 'scope'],
          rows: result.results.map(item => [
            item.id,
            truncate(item.title, TITLE_MAX_LENGTH, '...'),
            item.scope
          ])
        });
        return;
      }

      console.log(JSON.stringify(result, null, 2));
    }));

  const semanticCommand = memoryCommand
    .command('semantic')
    .description('Manage the optional local semantic model');

  semanticCommand
    .command('status')
    .description('Show semantic model and embedding readiness')
    .action(withErrorHandler('show semantic status', async () => {
      const result = await memorySemanticStatusCommand({ dbPath: await resolveMemoryDbPath() });
      console.log(JSON.stringify(result, null, 2));
    }));

  semanticCommand
    .command('download')
    .description('Download and verify the pinned local semantic model')
    .action(withErrorHandler('download semantic model', async () => {
      const result = await memoryDownloadSemanticCommand({ dbPath: await resolveMemoryDbPath() });
      console.log(JSON.stringify(result, null, 2));
    }));

  memoryCommand
    .command('reembed')
    .description('Backfill missing or stale semantic embeddings')
    .option('--force', 'Recompute all embeddings')
    .action(withErrorHandler('re-embed memory', async (options: { force?: boolean }) => {
      const result = await memoryReembedCommand({
        dbPath: await resolveMemoryDbPath(),
        force: options.force === true,
      });
      console.log(JSON.stringify(result, null, 2));
    }));
}
