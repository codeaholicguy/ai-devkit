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
- Effective database path selection is resolved in the CLI and passed explicitly into the memory package.

## Implementation Notes
### Core Features
- Add typed support for `memory.path` in project config.
- Resolve relative configured paths from the project root.
- Pass the resolved path into `ai-devkit memory store`, `search`, and `update`.

### Patterns & Best Practices
- Keep `DEFAULT_DB_PATH` as the fallback constant.
- Avoid duplicating path-resolution logic across CLI command handlers.

## Integration Points
- `.ai-devkit.json`
- `ConfigManager`
- memory CLI command adapters

## Error Handling
- Invalid or absent `memory.path` should not break memory commands; fall back to the default path.

## Performance Considerations
- Path resolution should happen once per CLI command invocation before opening the database.

## Security Notes
- Treat `memory.path` as a filesystem path only; no shell execution or interpolation.
- Standalone `@ai-devkit/memory` server behavior remains unchanged in this feature.
