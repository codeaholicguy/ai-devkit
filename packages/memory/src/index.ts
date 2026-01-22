#!/usr/bin/env node

import { Command } from 'commander';
import { memoryStoreCommand, memorySearchCommand } from './api';
import type { MemoryStoreOptions, MemorySearchOptions } from './api';

const program = new Command();

program
    .name('ai-devkit-memory')
    .description('Knowledge memory service for AI agents')
    .version('0.1.0');

program
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
            console.error(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }, null, 2));
            process.exit(1);
        }
    });

program
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
                limit: options.limit ? parseInt(options.limit, 10) : 5,
            });
            console.log(JSON.stringify(result, null, 2));
        } catch (error) {
            console.error(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }, null, 2));
            process.exit(1);
        }
    });

program
    .command('serve')
    .description('Start the MCP server (default mode)')
    .action(async () => {
        const { runServer } = await import('./server');
        await runServer();
    });

// Default to serve mode if no command specified
if (process.argv.length === 2) {
    const { runServer } = require('./server');
    runServer().catch((error: Error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
} else {
    program.parse();
}
