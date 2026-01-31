#!/usr/bin/env node

import { runServer } from './server';

export * from './api';

// Only start MCP server when this file is run directly as a binary
// Not when imported as a library (e.g., by CLI commands)
if (require.main === module) {
    runServer().catch((error: Error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
}
