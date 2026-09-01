# @ai-devkit/memory

A local MCP-based memory service for AI coding agents. Store project decisions, coding conventions, and reusable fixes so agents can retrieve them across sessions with SQLite full-text search.

[![npm version](https://img.shields.io/npm/v/@ai-devkit/memory.svg)](https://www.npmjs.com/package/@ai-devkit/memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Most users get this automatically through `ai-devkit init`. Install `@ai-devkit/memory` directly when you want to wire the MCP memory server into your own MCP client configuration.

## Features

- 🔍 **Full-Text Search** — FTS5 with BM25 ranking
- 🧠 **Optional Semantic Search** — Local MiniLM embeddings fused with lexical ranks
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

## Optional semantic search

Semantic search is disabled by default. Enable it in the project's `.ai-devkit.json`:

```json
{
  "memory": {
    "semantic": true
  }
}
```

The first semantic operation downloads a pinned 23 MB quantized MiniLM model to `~/.ai-devkit/models`. Queries and memory content are embedded locally and are not sent to an inference service. Once cached, the model works offline. If it is unavailable, search returns lexical FTS results instead.

You can prepare and inspect the cache explicitly, then backfill existing memories:

```bash
ai-devkit memory semantic status
ai-devkit memory semantic download
ai-devkit memory reembed
```

Use `ai-devkit memory reembed --force` after troubleshooting a cache or embedding issue. Add `--explain` to `memory search` to include lexical rank, semantic rank, cosine similarity, and reciprocal-rank-fusion score.

## Documentation

📖 **For the full API reference, ranking details, and advanced usage, visit:**

**[ai-devkit.com/docs](https://ai-devkit.com/docs/)**

## License

MIT
