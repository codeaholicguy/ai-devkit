---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide — Task System

## Development Setup
**How do we get started?**

- Node `>=20.20.0`, monorepo with nx + swc + vitest (no new tooling introduced).
- Work in the `feature-task-system` worktree at `.worktrees/feature-task-system`.
- `npm ci` bootstraps the workspace; the new package is symlinked under
  `node_modules/@ai-devkit/task-manager` automatically.

## Code Structure
**How is the code organized?**

New package `packages/task-manager` mirrors `@ai-devkit/memory`:

```
packages/task-manager/
  src/
    types/index.ts      # public types: Actor, Task, TaskEvent, TaskEventType union, payloads
    errors.ts           # TaskError hierarchy + isTaskEventType guard
    ids.ts              # stable id generators + collision-safe makeUniqueId
    actor-resolver.ts   # resolveCurrentActor (env + process), ATTRIB_ENV
    store/types.ts      # TaskStore SPI
    store/sqlite-store.ts # SqliteTaskStore implements TaskStore
    database/           # connection.ts (WAL/migrations), schema.ts, migrations/001_initial.sql
    service.ts          # TaskService (storage-agnostic; consume-only surface)
    index.ts            # public exports (import path @ai-devkit/task-manager)
  tests/
    unit/               # ids, actor-resolver, errors
    integration/        # sqlite-store, service, add-event coverage, store errors
```

CLI: `packages/cli/src/commands/task.ts` registers `ai-devkit task ...`; wired in `cli.ts`.
Test: `packages/cli/src/__tests__/commands/task.test.ts`.

## Implementation Notes
**Key technical details to remember:**

### Core Features
- **Public API surface:** the exported type names, field names, and `TaskEventType` union
  strings in `src/index.ts` are the package's public API; keep them stable for consumers.
- **Snapshot + events:** the `tasks` table holds the authoritative snapshot (full Task JSON +
  indexed columns); the `task_events` table is the append-only audit trail. Stateful event
  types mutate the snapshot **and** append; `task.note.append` / `task.custom` are event-only.
- **resolveTask resolution order:** full id → unique id prefix (error if ambiguous) → feature
  key (latest non-terminal task). Powers dev-lifecycle/verify "current task for feature".
- **addEvent escape hatch:** applies the matching snapshot mutation for stateful types, else
  appends only. Used by typed setters internally and by callers for `task.custom` observability.

### Patterns & Best Practices
- Storage-agnostic: `TaskService` depends only on the `TaskStore` SPI; `SqliteTaskStore` is
  the default impl, and a future store can swap in without caller changes.
- SQLite mirrors `@ai-devkit/memory`: `better-sqlite3`, WAL + `busy_timeout` +
  `synchronous=NORMAL`, versioned migrations tracked via the `user_version` pragma. Unlike
  memory's process-global connection, `SqliteTaskStore` owns its own connection (better test
  isolation) and exposes `close()`.
- Every mutator accepts `opts?{actor}` and auto-resolves attribution when omitted.
- List ordering is `createdAt` desc then `taskId` desc (deterministic for same-second tasks).

## Integration Points
**How do pieces connect?**

- CLI → `TaskService` → `TaskStore` (SPI) → `SqliteTaskStore` → SQLite (`~/.ai-devkit/tasks.db`).
- Skills (`dev-lifecycle`, `verify`, `structured-debug`) emit via `ai-devkit task ...`.
- Storage default `~/.ai-devkit/tasks.db`; override via `--store`, `AIDEVKIT_TASKS_DB`, or
  the `SqliteTaskStore` / `DatabaseConnection` constructor arg.

## Error Handling
**How do we handle failures?**

- Typed errors: `TaskNotFoundError`, `TaskValidationError`, `AmbiguousTaskRefError`,
  `TaskResourceNotFoundError`, `TaskStoreError`, `UnknownEventTypeError` (all extend `TaskError`
  with `.code`/`.toJSON()`).
- Atomicity: each snapshot write / event append is a single SQLite statement (autocommit),
  so a crash never leaves a half-written row. WAL + `synchronous=NORMAL` protect durability.
- All store I/O errors (including connection-open and JSON parse failures) are wrapped as
  `TaskStoreError`.

## Performance Considerations
**How do we keep it fast?**

- MVP targets hundreds of tasks. `task_id`/`feature`/`status`/`phase` lookups are indexed.
  (`list` still loads all snapshots in-memory for sort/filter; store-level filtering is a
  future optimization needing no API change.)
- `eventCount`/`lastEventAt` are cached on the snapshot to avoid re-reading events for listing.
- WAL keeps reads non-blocking while writers serialize.

## Security Notes
**What security measures are in place?**

- Strict input validation (non-empty title, kebab-case feature, percent 0..100, status enum).
- Artifacts are references only — the store never copies user files, so no path injection of
  file contents into the task dir.
- Attribution is best-effort local metadata (agent id/type/pid/session); no auth/permissions in
  MVP (single-user local tool, documented limitation).
