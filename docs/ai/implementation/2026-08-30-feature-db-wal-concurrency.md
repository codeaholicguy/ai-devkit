---
phase: implementation
title: Concurrency-safe WAL setup implementation
description: Implementation record for the three SQLite connection classes
---

# Implementation

## Scope

- `packages/memory/src/database/connection.ts`
- `packages/agent-manager/src/database/connection.ts`
- `packages/task-manager/src/database/connection.ts`

## Notes

- Each constructor passes `timeout: 5000` to `better-sqlite3`.
- Configuration reads `journal_mode` and only requests WAL when required.
- Configuration errors propagate unchanged; no synchronous retry mechanism is used.
- Existing pragmas, schema behavior, dependencies, and public APIs are unchanged.

The implementation follows the design without deviations.
