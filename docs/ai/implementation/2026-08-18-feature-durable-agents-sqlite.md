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

Implementation is pending. This document will be updated in lockstep with completed task groups, including files changed, transaction boundaries, error mappings, edge cases, and any design deviations.

## Integration Points

`ClaudePrintAgentService`, runners, CLI call sites, `LocalProcessInspector`, cwd canonicalization, and exported print-agent types remain API-compatible. The store shares the agent-manager `DatabaseConnection` and migration sequence.

## Error Handling

SQLite constraint/locking/corruption failures will be mapped to existing print-agent domain errors where applicable. Legacy validation failures abort import without a marker, rows, or backup rename. Conditional updates changing zero rows represent lost ownership.

## Performance and Security

Writes use short immediate transactions and indexed lookups. Process/filesystem inspection occurs outside write transactions. Canonical cwd binding, symlink checks, token ownership, and PID start-time validation are preserved.
