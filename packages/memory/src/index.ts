#!/usr/bin/env node

import { runServer } from './server';

runServer().catch((error: Error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
