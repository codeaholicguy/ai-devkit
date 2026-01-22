# @ai-devkit/memory

A lightweight MCP-based memory service for AI agents. Store and retrieve actionable knowledge using SQLite with FTS5 full-text search.

## Features

- 🔍 **Full-Text Search** - FTS5 with BM25 ranking
- 🏷️ **Tag-Based Filtering** - Boost results by contextTags
- 📁 **Scoped Knowledge** - global, project, or repo-specific rules
- 🔄 **Deduplication** - Prevents duplicate content
- ⚡ **Fast** - SQLite with WAL mode, <50ms search latency
- 📦 **Portable** - Single database file, no external dependencies

## Installation

```bash
npm install @ai-devkit/memory
```

## Quick Start

### As MCP Server

Add to your MCP client configuration:

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

### Using the Tools

#### Store Knowledge

```json
{
  "tool": "memory.storeKnowledge",
  "arguments": {
    "title": "Always use Response DTOs for API endpoints",
    "content": "When building REST APIs, always use Response DTOs instead of returning domain entities directly. This provides better API versioning, security, and decoupling.",
    "tags": ["api", "backend", "dto"],
    "scope": "global"
  }
}
```

#### Search Knowledge

```json
{
  "tool": "memory.searchKnowledge",
  "arguments": {
    "query": "building an API endpoint",
    "contextTags": ["api"],
    "limit": 5
  }
}
```

## API Reference

### `memory.storeKnowledge`

Store a new knowledge item.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | ✅ | Short description (10-100 chars) |
| `content` | string | ✅ | Detailed explanation in markdown (50-5000 chars) |
| `tags` | string[] | ❌ | Domain keywords (max 10) |
| `scope` | string | ❌ | `global`, `project:<name>`, or `repo:<name>` |

### `memory.searchKnowledge`

Search for relevant knowledge.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✅ | Natural language task description (3-500 chars) |
| `contextTags` | string[] | ❌ | Tags to boost matching results |
| `scope` | string | ❌ | Scope filter (project results prioritized) |
| `limit` | number | ❌ | Max results (1-20, default: 5) |

## Ranking Algorithm

Results are ranked using:

```
final_score = bm25_score × tag_boost + scope_boost

Where:
  bm25_score  = FTS5 bm25() with column weights (title=10, content=5, tags=1)
  tag_boost   = 1 + (matching_tags × 0.1)
  scope_boost = +0.5 if scope matches, +0.2 if global
```

## Database Location

Default: `~/.ai-devkit/memory.db`

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run with MCP Inspector
npm run inspect

# Start server
npm run start
```

## License

MIT
