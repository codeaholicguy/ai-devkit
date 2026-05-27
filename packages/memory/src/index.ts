#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { runServer } from './server.js';

export * from './api.js';

// Only start MCP server when this file is run directly as a binary
// Not when imported as a library (e.g., by CLI commands)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runServer().catch((error: Error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}
