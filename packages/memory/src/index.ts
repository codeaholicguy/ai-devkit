#!/usr/bin/env node

import { isMainModule } from "./entrypoint.js";
import { runServer } from "./server.js";

export * from "./api.js";

// Only start MCP server when this file is run directly as a binary
// Not when imported as a library (e.g., by CLI commands)
if (isMainModule(process.argv[1], import.meta.url)) {
  runServer().catch((error: Error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}
