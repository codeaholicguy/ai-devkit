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
  `node_modules/@ai-devkit/task-manager` automatically for local development.
- End users enable the `task` command explicitly with
  `ai-devkit plugin add @ai-devkit/task-manager`; the core CLI does not import or register it.

## Code Structure
**How is the code organized?**

New package `packages/task-manager` mirrors `@ai-devkit/memory`:

```
packages/task-manager/
  src/
    task.types.ts       # public types: Actor, Task, TaskEvent, TaskEventType union, payloads
    task.errors.ts      # TaskError hierarchy + isTaskEventType guard
    task.ids.ts         # raw UUID id generators (crypto.randomUUID)
    task.repository.ts  # TaskRepository — task/event persistence (SQLite)
    task.service.ts     # TaskService (public consume-only surface)
    command.ts          # optional AI DevKit plugin command entrypoint
    database/           # connection.ts (WAL/migrations), schema.ts, migrations/001_initial.sql
    index.ts            # public exports (import path @ai-devkit/task-manager)
  tests/
    unit/               # task.ids, task.errors
    integration/        # task.repository, service, add-event coverage, repository errors
```

Structure follows `@ai-devkit/memory`: a `database/` module (connection/schema/migrations)
with the business module split into `task.repository.ts` (persistence) and `task.service.ts`
(logic), mirroring memory's split between `database/` and `handlers/`.

Plugin CLI: `packages/task-manager/src/command.ts` registers subcommands on the host-provided
`task` command. The command is discovered from `package.json` `aiDevkit.commands`, not wired
into `packages/cli/src/cli.ts`.
Test: `packages/task-manager/tests/command.test.ts`.

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
- Persistence: `TaskService` uses `TaskRepository` for all task/event storage.
- SQLite mirrors `@ai-devkit/memory`: `better-sqlite3`, WAL + `busy_timeout` +
  `synchronous=NORMAL`, versioned migrations tracked via the `user_version` pragma.
  `TaskRepository` uses the process-wide `getDatabase()` singleton (same pattern as
  memory) and only holds a DB path; tests reset the singleton with `closeDatabase()` between
  cases to switch database files.
- **Ids are raw UUIDs** (`<uuid>` (raw UUIDv4), …) from Node `crypto.randomUUID()`, generated in
  the service layer (like memory generates ids in its handlers, not in the DB layer). No
  collision checks or central counters are needed.
- Every mutator accepts `opts?{actor}` and stores `null` when caller omits actor metadata.
- List ordering is `createdAt` desc then `taskId` desc (deterministic for same-second tasks).

## Integration Points
**How do pieces connect?**

- Plugin CLI → project `.ai-devkit.json` `tasks.path` → `TaskService` → `TaskRepository` →
  SQLite (else `~/.ai-devkit/tasks.db`).
- Skills (`dev-lifecycle`, `verify`, `structured-debug`) can emit via `ai-devkit task ...`
  when the optional plugin is installed/enabled.
- Storage default `~/.ai-devkit/tasks.db`; the plugin CLI resolves `.ai-devkit.json` `tasks.path`, and
  explicit overrides use `--db-path` or the `TaskRepository` / `DatabaseConnection`
  constructor arg.

## Error Handling
**How do we handle failures?**

- Typed errors: `TaskNotFoundError`, `TaskValidationError`, `AmbiguousTaskRefError`,
  `TaskResourceNotFoundError`, `TaskRepositoryError`, `UnknownEventTypeError` (all extend `TaskError`
  with `.code`/`.toJSON()`).
- Atomicity: each snapshot write / event append is a single SQLite statement (autocommit),
  so a crash never leaves a half-written row. WAL + `synchronous=NORMAL` protect durability.
- All repository I/O errors (including connection-open and JSON parse failures) are wrapped as
  `TaskRepositoryError`.

## Performance Considerations
**How do we keep it fast?**

- MVP targets hundreds of tasks. `task_id`/`feature`/`status`/`phase` lookups are indexed.
  (`list` still loads all snapshots in-memory for sort/filter; repository-level filtering is a
  future optimization needing no API change.)
- `eventCount`/`lastEventAt` are cached on the snapshot to avoid re-reading events for listing.
- WAL keeps reads non-blocking while writers serialize.

## Security Notes
**What security measures are in place?**

- Strict input validation (non-empty title, kebab-case feature, percent 0..100, status enum).
- Artifacts are references only — the repository never copies user files, so no path
  injection of file contents into the database.
- Attribution is best-effort local metadata (agent id/type/pid/session); no auth/permissions in
  MVP (single-user local tool, documented limitation).
