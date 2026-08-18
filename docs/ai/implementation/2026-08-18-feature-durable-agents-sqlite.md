---
phase: implementation
title: Durable Agents SQLite Implementation
description: Implementation record for the durable-agent persistence backend
---

# Durable Agents SQLite Implementation

## Development Setup

- Worktree: `feature-durable-agents-sqlite`
- Bootstrap: `npm ci`
- Initial workspace build: `npm run build`
- Task tracing: unavailable (`ai-devkit task` is not a supported command).

## Code Structure

- `packages/agent-manager/src/database/`: connection behavior, schema runner, and migration SQL.
- `packages/agent-manager/src/print/PrintAgentStore.ts`: unchanged public adapter backed by SQLite.
- `packages/agent-manager/src/__tests__/`: schema, store, migration, concurrency, and integration coverage.

## Implementation Notes

- Added `003_durable_agents.sql` with the flattened durable-agent schema, lifecycle/result constraints, active-run consistency checks, import metadata, and list/state indexes.
- Updated `DatabaseConnection` so readonly construction neither creates parent directories nor runs migrations or write pragmas, and requires schema version 3 or newer.
- Replaced JSON CRUD, global mutation locks, per-agent lock directories, owner files, quarantine, and temp-file replacement inside `PrintAgentStore` with SQLite row mapping and writes.
- Added `dbPath` and readonly store options. `filePath` is retained for one compatibility release and maps injected JSON test paths through the registry path resolver. Legacy timing options remain accepted but unused with TypeScript and README deprecations.
- Implemented one-time version-1 JSON import in `BEGIN IMMEDIATE`; every agent is validated before insertion, marker/data roll back together, and the source is renamed only after commit.
- Implemented acquisition with process inspection outside `BEGIN IMMEDIATE`, transaction reread, and conditional claim. Provider recording and completion require `(id, token)`; recovery/reconciliation also compare the observed owner/run start identity.
- Kept writable `list()` reconciliation behavior while readonly `list()` performs only a query.

## Integration Points

`ClaudePrintAgentService`, runners, CLI call sites, `LocalProcessInspector`, cwd canonicalization, and exported print-agent types remain API-compatible. The store shares the agent-manager `DatabaseConnection` and migration sequence.

## Error Handling

SQLite name uniqueness maps to `PrintAgentNameConflictError`; lock contention maps to `PrintAgentBusyError`; open, corruption, validation, and other storage failures map to `PrintAgentStoreError`. Legacy validation failures abort import without a marker, rows, or backup rename. Conditional updates changing zero rows represent lost ownership.

## Performance and Security

Writes use short immediate transactions and indexed lookups. Process/filesystem inspection occurs outside write transactions. Canonical cwd binding, symlink checks, token ownership, and PID start-time validation are preserved.

## Design Alignment

The implementation follows the approved separate-table, flattened-latest-result, unchanged-adapter, one-way-import, and SQLite-CAS design. No service, runner, CLI, or print-domain rename was introduced. No design deviations are recorded.
