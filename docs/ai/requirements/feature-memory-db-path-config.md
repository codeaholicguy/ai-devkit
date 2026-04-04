---
phase: requirements
title: Requirements & Problem Understanding
description: Allow project config to override the default memory database path
---

# Requirements & Problem Understanding

## Problem Statement
- Memory storage currently defaults to `~/.ai-devkit/memory.db` via `packages/memory/src/database/connection.ts`.
- Projects cannot pin memory storage to a repo-specific database, so contributors working in the same repository may read and write different global state.
- Users who want isolated project memory have no supported configuration path in `.ai-devkit.json`.

## Goals & Objectives
- Allow project `.ai-devkit.json` to define `memory.path`.
- Keep the existing default database path as `~/.ai-devkit/memory.db` when no project override is configured.
- Make memory commands use the configured project path consistently for store, search, and update flows.
- Scope the change to `ai-devkit` project commands and avoid changing standalone `@ai-devkit/memory` package behavior.

## Non-Goals
- Adding a global `memory.path` override in `~/.ai-devkit/.ai-devkit.json`.
- Redesigning unrelated `.ai-devkit.json` sections.
- Changing the default database filename or directory.
- Making standalone `@ai-devkit/memory` automatically read project `.ai-devkit.json`.

## User Stories & Use Cases
- As a project maintainer, I can commit `"memory": { "path": ".ai-devkit/project-memory.db" }` to `.ai-devkit.json` so everyone on the repository uses the same project-local memory database.
- As a developer without project memory config, I continue using `~/.ai-devkit/memory.db` with no behavior change.
- As a user running `ai-devkit memory search`, `store`, or `update` inside a configured project, I want all commands to resolve the same configured database path automatically.
- As a user running the standalone `@ai-devkit/memory` MCP server directly, I continue using its package default path unless a later feature adds separate config support.

## Success Criteria
- Project `.ai-devkit.json` accepts a `memory.path` string.
- When `memory.path` is present in project config, `ai-devkit memory` operations use that path instead of `~/.ai-devkit/memory.db`.
- When `memory.path` is absent, empty, or invalid, memory operations fall back to `~/.ai-devkit/memory.db`.
- Relative configured paths are resolved deterministically from the project root containing `.ai-devkit.json`.
- Tests cover configured path resolution and default fallback behavior.
- Standalone `@ai-devkit/memory` behavior remains unchanged in this feature.

## Constraints & Assumptions
- `ConfigManager` already owns project `.ai-devkit.json` loading in `packages/cli/src/lib/Config.ts`.
- The current memory package hard-codes the default path in `packages/memory/src/database/connection.ts`; implementation must preserve that default for non-project-aware callers.
- The project config shape currently allows additive extension without a broader schema migration.
- The configured path should remain a plain filesystem path string; no environment-variable expansion is required unless existing config code already supports it.
- `packages/memory` should not gain a dependency on the CLI package just for this feature.

## Questions & Open Items
- The config key will be `memory.path` in project `.ai-devkit.json`.
- Relative paths will be interpreted relative to the directory containing `.ai-devkit.json`, not the shell's current working directory.
- Scope decision: only `ai-devkit` project commands will honor `memory.path`; standalone `@ai-devkit/memory` is out of scope.
- No additional blocking questions remain for implementation.
