---
phase: design
title: System Design & Architecture
description: Resolve memory database path from project config with default fallback
---

# System Design & Architecture

## Architecture Overview
```mermaid
graph TD
  ProjectConfig[./.ai-devkit.json] --> ConfigManager
  ConfigManager --> Resolver[CLI memory path resolver]
  CLI[ai-devkit memory *] --> Resolver
  Resolver --> MemoryAPI[@ai-devkit/memory API]
  DefaultPath[~/.ai-devkit/memory.db] --> MemoryAPI
  MemoryAPI --> DatabasePath[Effective DB path]
  DatabasePath --> SQLite[(SQLite memory.db)]
```

- Keep `DEFAULT_DB_PATH` as the baseline fallback in the memory package.
- Add a CLI-owned resolver that can return a project override from `.ai-devkit.json`.
- Pass the resolved path from the CLI into `@ai-devkit/memory` before opening SQLite.
- Leave the standalone `@ai-devkit/memory` MCP server unchanged so it continues using `DEFAULT_DB_PATH`.

## Data Models
- Extend `DevKitConfig` with an optional memory section:
  ```ts
  interface DevKitConfig {
    memory?: {
      path?: string;
    };
  }
  ```
- Extend CLI-to-memory command options with optional `dbPath?: string`.
- Resolver output is either:
  - an absolute filesystem path derived from `memory.path`
  - `undefined`, which means the memory package falls back to `DEFAULT_DB_PATH`

## API Design
- Add `ConfigManager.getMemoryDbPath(): Promise<string | undefined>` to read project config safely.
- Resolve `memory.path` inside the CLI command layer, not inside `packages/memory`.
- Add optional `dbPath` support to the memory package command APIs used by the CLI:
  - `memoryStoreCommand(options)`
  - `memorySearchCommand(options)`
  - `memoryUpdateCommand(options)`
- Keep `packages/memory/src/server.ts` and the `ai-devkit-memory` binary unchanged in this feature.

## Component Breakdown
- `packages/cli/src/types.ts`
  - Add optional `memory.path` typing to project config.
- `packages/cli/src/lib/Config.ts`
  - Parse and validate `memory.path` from project config.
  - Resolve relative paths against the config file directory.
- `packages/cli/src/commands/memory.ts`
  - Load the project config once per command invocation.
  - Pass resolved `dbPath` into the imported memory command API.
- `packages/memory/src/database/connection.ts`
  - Continue exposing `DEFAULT_DB_PATH`.
  - Accept explicit `dbPath` from callers without changing fallback semantics.
- `packages/memory/src/api.ts`
  - Accept optional `dbPath` on CLI-facing command option types.
  - Call `getDatabase({ dbPath })` so the explicit path only affects CLI-triggered operations that pass it.
- Tests
  - Config parsing tests in CLI package.
  - Memory command resolution tests in CLI and memory package.
  - No standalone MCP server behavior change tests are needed beyond regression confidence.

## Design Decisions
- Keep fallback logic in the memory package and config parsing in the CLI package to preserve clear responsibilities.
- Resolve relative paths from the project root so checked-in config behaves consistently across shells and CI.
- Treat missing, blank, or non-string `memory.path` as unset and fall back silently to `DEFAULT_DB_PATH` to preserve backward compatibility.
- Keep the package boundary intact by passing `dbPath` explicitly from the CLI rather than making `packages/memory` depend on `ConfigManager`.
- Apply the configured path to `store`, `search`, and `update` so CLI memory subcommands stay consistent.

## Non-Functional Requirements
- No change to default behavior for projects without `memory.path`.
- No additional network or external service dependency.
- Path resolution must be deterministic across macOS and Linux path semantics already supported by Node's `path` module.
- Database initialization and schema migration behavior remain unchanged once the final path is selected.
- Standalone `@ai-devkit/memory` server startup and runtime behavior remain unchanged in this feature.
