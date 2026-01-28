import type { Command } from 'commander';
import { memoryStoreCommand, memorySearchCommand } from '@ai-devkit/memory';
import type { MemorySearchOptions, MemoryStoreOptions } from '@ai-devkit/memory';
import { ui } from '../util/terminal-ui';

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
    .command('search')
    .description('Search for knowledge items')
    .requiredOption('-q, --query <query>', 'Search query (3-500 chars)')
    .option('--tags <tags>', 'Comma-separated context tags to boost results')
    .option('-s, --scope <scope>', 'Scope filter')
    .option('-l, --limit <limit>', 'Maximum results (1-20)', '5')
    .action((options: MemorySearchOptions & { limit?: string }) => {
      try {
        const result = memorySearchCommand({
          ...options,
          limit: options.limit ? parseInt(options.limit, 10) : 5
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ui.error(message);
        process.exit(1);
      }
    });
}