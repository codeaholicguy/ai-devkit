---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup

- Active worktree: `.worktrees/feature-agent-registry-sqlite`
- Branch: `feature-agent-registry-sqlite`
- Dependencies: `npm ci`

## Code Structure

- `packages/agent-manager/src/utils/AgentRegistry.ts`
  - Agent registry behavior and SQLite row mapping.
  - Merge/upsert, lookup, list, rename, prune.
- `packages/agent-manager/src/database/connection.ts`
  - SQLite connection wrapper, path resolution, pragmas, query helpers, transactions, and close behavior.
- `packages/agent-manager/src/database/schema.ts`
  - Migration discovery, schema initialization, and `user_version` management.
- `packages/agent-manager/src/database/migrations/001_initial.sql`
  - Initial SQLite table migration.
- `packages/agent-manager/src/database/index.ts`
  - Database module exports.
- `packages/agent-manager/src/__tests__/utils/AgentRegistry.test.ts`
  - Primary unit coverage for storage and merge semantics.
- `packages/agent-manager/src/__tests__/AgentManager.test.ts`
  - Manager-level regression coverage for list-driven registry writes.

## Implementation Notes

### Core Features

- Use `better-sqlite3` synchronously; this package is already a dependency of `@ai-devkit/agent-manager`.
- Keep SQLite connection, schema setup, and SQL migrations in `src/database/*`, following the memory/task package pattern.
- Copy `src/database/migrations` into `dist/database/` during package build so runtime schema initialization can load SQL files after SWC compilation.
- Keep `AgentRegistry.default()` and constructor injection for tests.
- Constructor should accept the existing path argument for compatibility. If callers pass `.../agents.json`, derive DB path by replacing `.json` with `.db`; if callers pass another path, use it as the database path unless a JSON extension clearly indicates legacy path intent.
- Initialize schema in the constructor or lazily before the first operation.
- Do not import legacy `agents.json`; running agents repopulate SQLite through normal discovery/start registration.

### Implemented Files

- `packages/agent-manager/src/utils/AgentRegistry.ts` now stores rows in SQLite with `PRIMARY KEY (type, pid)` and a unique name constraint.
- `packages/agent-manager/src/database/*` now owns the SQLite connection wrapper, schema initialization, and path derivation.
- `packages/agent-manager/package.json` copies migration SQL files during build, matching the memory/task package build scripts.
- `packages/agent-manager/src/__tests__/utils/AgentRegistry.test.ts` covers schema creation, ignored legacy JSON, PID-aware merge, managed-name replacement, prune, rename, and concurrent registry instances.
- `packages/agent-manager/src/__tests__/AgentManager.test.ts` covers the observed custom-name-overwritten-by-fallback regression.

### Patterns & Best Practices

- Treat `type + pid` as canonical live identity.
- Preserve user-managed names over generated fallback names.
- Prefer incoming non-empty metadata over empty metadata.
- Keep storage errors explicit.

## Integration Points

- `AgentManager.listAgents()` should not need a major rewrite; SQLite upsert fixes duplicate rows underneath it.
- `startAgent()` continues calling `registry.register(entry)` after polling the actual provider PID.
- `killAgent()` continues resolving `tmuxSession` by `lookup(agent.name)`.

## Error Handling

- SQLite constraint errors should surface in tests and CLI because they indicate a real storage bug.
- Rename conflict behavior should remain explicit through `RenameConflictError`.

## Performance Considerations

- Use primary-key and name indexes/constraints for direct lookup.
- Keep transactions around batch registration.

## Security Notes

- Registry data is local process/session metadata only.
- No credential or prompt content is stored in the registry.
