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
- `packages/agent-manager/src/durable/DurableAgentRepository.ts`: unchanged public adapter backed by SQLite.
- `packages/agent-manager/src/__tests__/`: schema, store, concurrency, and integration coverage.

## Implementation Notes

- Added `003_durable_agents.sql` with the flattened durable-agent schema, lifecycle/result constraints, active-run consistency checks, and list/state indexes.
- Updated `DatabaseConnection` so readonly construction neither creates parent directories nor runs migrations or write pragmas, and requires schema version 3 or newer.
- Replaced JSON CRUD, global mutation locks, per-agent lock directories, owner files, quarantine, and temp-file replacement inside `DurableAgentRepository` with SQLite row mapping and writes.
- Added `dbPath` and readonly store options. Legacy timing options remain accepted but unused with TypeScript and README deprecations.
- Implemented acquisition with process inspection outside `BEGIN IMMEDIATE`, transaction reread, and conditional claim. Provider recording and completion require `(id, token)`; recovery/reconciliation also compare the observed owner/run start identity.
- Kept writable `list()` reconciliation behavior while readonly `list()` performs only a query.
- Standardized the unreleased domain API on `DurableAgent*`, including files, store options, run/result types, error classes/codes, CLI references, tests, and documentation. Claude-specific print-provider class names and the `--mode print` mechanism remain unchanged.

## Integration Points

`ClaudePrintAgentService`, runners, CLI call sites, `LocalProcessInspector`, cwd canonicalization, and exported durable-agent types remain API-compatible. The store shares the agent-manager `DatabaseConnection` and migration sequence.

## Error Handling

SQLite name uniqueness maps to `DurableAgentNameConflictError`; lock contention maps to `DurableAgentBusyError`; open, corruption, validation, and other storage failures map to `DurableAgentRepositoryError`. Conditional updates changing zero rows represent lost ownership.

## Performance and Security

Writes use short immediate transactions and indexed lookups. Process/filesystem inspection occurs outside write transactions. Canonical cwd binding, symlink checks, token ownership, and PID start-time validation are preserved.

## Design Alignment

The implementation follows the approved separate-table, flattened-latest-result, unchanged-adapter, and SQLite-CAS design. Durable agents persist directly in `agents.db`; the unreleased JSON import compatibility path was removed by product-owner direction. No service, runner, CLI, or print-domain rename was introduced.
