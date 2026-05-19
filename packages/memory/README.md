# @ai-devkit/memory

A local MCP-based memory service for AI coding agents. Store project decisions, coding conventions, and reusable fixes so agents can retrieve them across sessions with SQLite full-text search.

[![npm version](https://img.shields.io/npm/v/@ai-devkit/memory.svg)](https://www.npmjs.com/package/@ai-devkit/memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Most users get this automatically through `ai-devkit init`. Install `@ai-devkit/memory` directly when you want to wire the MCP memory server into your own MCP client configuration.

## Features

- 🔍 **Full-Text Search** — FTS5 with BM25 ranking
- 🏷️ **Tag-Based Filtering** — Organize and find knowledge by tags
- 📁 **Scoped Knowledge** — Global, project, or repo-specific rules
- 🔄 **Deduplication** — Prevents duplicate content automatically
- ⚡ **Fast** — SQLite with WAL mode, <50ms search latency

## Installation

```bash
npm install @ai-devkit/memory
```

## Quick Start

Add to your MCP client configuration (e.g., Claude Code, Cursor):

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@ai-devkit/memory"]
    }
  }
}
```

Example developer use case: after deciding that all API responses must use DTOs, store that rule once. Future agent sessions can search memory before implementing new endpoints instead of asking you to repeat the convention.

### Store Knowledge

```json
{
  "tool": "memory_storeKnowledge",
  "arguments": {
    "title": "Always use Response DTOs for API endpoints",
    "content": "When building REST APIs, always use Response DTOs instead of returning domain entities directly.",
    "tags": ["api", "backend", "dto"],
    "scope": "global"
  }
}
```

### Search Knowledge

```json
{
  "tool": "memory_searchKnowledge",
  "arguments": {
    "query": "building an API endpoint",
    "contextTags": ["api"],
    "limit": 5
  }
}
```

## Documentation

📖 **For the full API reference, ranking details, and advanced usage, visit:**

**[ai-devkit.com/docs](https://ai-devkit.com/docs/)**

## License

MIT
