---
phase: implementation
title: Implementation Guide
description: Implementation notes for project-configurable memory database paths
---

# Implementation Guide

## Development Setup
- Use the feature worktree `feature-memory-db-path-config`.
- Install dependencies with `npm ci` from the worktree root.

## Code Structure
- Config shape and parsing live in the CLI package.
- Effective database path selection must be shared by all memory entry points.

## Implementation Notes
### Core Features
- Add typed support for `memory.path` in project config.
- Resolve relative configured paths from the project root.
- Pass the resolved path into every memory operation entry point.

### Patterns & Best Practices
- Keep `DEFAULT_DB_PATH` as the fallback constant.
- Avoid duplicating path-resolution logic across command handlers and server code.

## Integration Points
- `.ai-devkit.json`
- `ConfigManager`
- memory CLI command adapters
- memory MCP server

## Error Handling
- Invalid or absent `memory.path` should not break memory commands; fall back to the default path.

## Performance Considerations
- Path resolution should happen once per command/tool invocation before opening the database.

## Security Notes
- Treat `memory.path` as a filesystem path only; no shell execution or interpolation.
