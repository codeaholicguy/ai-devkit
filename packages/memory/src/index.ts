#!/usr/bin/env node

import { runServer } from './server';

export * from './api';

runServer().catch((error: Error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
