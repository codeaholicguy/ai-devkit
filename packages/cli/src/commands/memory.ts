import type { Command } from 'commander';
import { memoryStoreCommand, memorySearchCommand, memoryUpdateCommand } from '@ai-devkit/memory';
import type { MemorySearchOptions, MemoryStoreOptions, MemoryUpdateOptions } from '@ai-devkit/memory';
import { ui } from '../util/terminal-ui';
import { truncate } from '../util/text';

const TITLE_MAX_LENGTH = 60;

export function registerMemoryCommand(program: Command): void {
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
    .action((options: MemoryStoreOptions) => {
      try {
        const result = memoryStoreCommand(options);
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ui.error(message);
        process.exit(1);
      }
    });

  memoryCommand
    .command('update')
    .description('Update an existing knowledge item by ID')
    .requiredOption('--id <id>', 'ID of the knowledge item to update')
    .option('-t, --title <title>', 'New title (10-100 chars)')
    .option('-c, --content <content>', 'New content (50-5000 chars)')
    .option('--tags <tags>', 'Comma-separated new tags (replaces existing)')
    .option('-s, --scope <scope>', 'New scope: global, project:<name>, or repo:<name>')
    .action((options: MemoryUpdateOptions) => {
      try {
        const result = memoryUpdateCommand(options);
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ui.error(message);
        process.exit(1);
      }
    });

  memoryCommand
    .command('search')
    .description('Search for knowledge items')
    .requiredOption('-q, --query <query>', 'Search query (3-500 chars)')
    .option('--tags <tags>', 'Comma-separated context tags to boost results')
    .option('-s, --scope <scope>', 'Scope filter')
    .option('-l, --limit <limit>', 'Maximum results (1-20)', '5')
    .option('--table', 'Display results as a table with id, title, and scope')
    .action((options: MemorySearchOptions & { limit?: string; table?: boolean }) => {
      try {
        const { table, limit, ...searchOptions } = options;
        const result = memorySearchCommand({
          ...searchOptions,
          limit: limit ? parseInt(limit, 10) : 5
        });

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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ui.error(message);
        process.exit(1);
      }
    });
}
