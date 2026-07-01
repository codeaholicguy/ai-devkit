---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown — Task System

## Milestones
**What are the major checkpoints?**

- [x] **M1 — Core package + SQLite store.** `@ai-devkit/task-manager` with types,
      `TaskService`, `SqliteTaskStore`, WAL/migrations, append-only events.
- [x] **M2 — CLI surface.** `ai-devkit task ...` wired into the CLI; `--json` + attribution.
- [x] **M3 — Tests, docs, simplify, validate.** Unit + integration coverage, README, simplify
      pass, green build/lint/test, commit, PR.

## Task Breakdown
**What specific work needs to be done?**

### M1: Core package + SQLite store
- [ ] **1.1 Scaffold package.** `packages/task-manager/{package.json, tsconfig.json,
      project.json, vitest.config.ts, .eslintrc.json, .swcrc, .gitignore}` mirroring
      `@ai-devkit/memory`. Name `@ai-devkit/task-manager`, `type: module`, strict TS.
      Validation: `nx lint task-manager` runs (even if no src yet).
- [ ] **1.2 Types module** (`src/types/index.ts`). `Actor`, `TaskStatus`, `LifecyclePhase`,
      `TaskProgress`, `TaskLinks`, `TaskBlocker`, `TaskEvidence`, `TaskArtifact`, `Task`,
      `TaskEventType` (closed union), `TaskEvent`. Type names per the design doc.
- [ ] **1.3 Errors** (`src/errors.ts`). `TaskError` base, `TaskNotFoundError`,
      `TaskValidationError`, `AmbiguousTaskRefError`, `TaskStoreError`.
- [ ] **1.4 IDs + time helpers** (`src/ids.ts`). `taskId`/`eventId`/`blockerId`/`evidenceId`/
      `artifactId` generators (`<prefix>-<YYYYMMDDHHMMSS>-<4 base36>`), collision-safe.
- [ ] **1.5 Actor resolver** (`src/actor-resolver.ts`). `resolveCurrentActor()`:
      flags/env/agent-manager best-effort/null. Pure env+process for MVP (no hard dep on
      agent-manager to keep package standalone); agent-manager lookup deferred.
- [ ] **1.6 TaskStore interface + SqliteTaskStore + database layer** (`src/store/`,
      `src/database/`). SPI `TaskStore` + `SqliteTaskStore`: `exists`, `readTask`, `writeTask`,
      `listTaskIds`, `readEvents`, `appendEvent`, `nextTaskId` (collision-safe).
      `database/{connection,schema,migrations}` mirrors `@ai-devkit/memory` (WAL, busy_timeout,
      versioned migrations via `user_version`).
- [ ] **1.7 TaskService** (`src/service.ts`). All service methods; delegates to store;
      applies snapshot mutation per event type; auto-resolves actor; `resolveTask`
      (full id → unique prefix → feature→latest non-terminal).
- [ ] **1.8 Package index** (`src/index.ts`). Export types + `TaskService` + `SqliteTaskStore` +
      CLI option interfaces (`TaskCreateOptions`, etc.) for the CLI layer, so consumers import
      via `@ai-devkit/task-manager`.

### M2: CLI surface
- [ ] **2.1 Dependency wire.** Add `@ai-devkit/task-manager` to `packages/cli/package.json`
      deps; register `registerTaskCommand(program)` in `cli.ts`.
- [ ] **2.2 task command** (`packages/cli/src/commands/task.ts`). All verbs/flags from the
      design doc; `--json`, `--store`, `--agent*` globals; `<id>` via `resolveTask`.
- [ ] **2.3 Output formatting.** `list` table (id/title/status/phase/feature), `show`
      pretty + `--events`, `--json` machine output everywhere.

### M3: Tests, docs, simplify, validate
- [x] **3.1 Unit tests** (`packages/task-manager/tests/unit/`). ids, actor-resolver,
      service mutation-per-event, resolveTask resolution order, validation errors.
- [x] **3.2 Integration tests** (`tests/integration/`). SqliteTaskStore round-trip,
      migrations, append-only events, addEvent escape hatch coverage, store error branches.
- [x] **3.3 CLI command tests** (`packages/cli/src/__tests__/commands/task.test.ts`) mirroring
      the memory command test pattern (mocked TaskService).
- [x] **3.4 README** (`packages/task-manager/README.md`) + a section in root README.
- [x] **3.5 simplify-implementation pass** on the new code.
- [x] **3.6 Validate**: `nx test`, `nx build`, `nx lint` green for task-manager + cli + repo.
- [ ] **3.7 Commit** (dev-commit) + **PR** (dev-pr). Report URL/SHA/limitations. **Do not merge.**

## Dependencies
**What needs to happen in what order?**

- 1.1 → 1.2 → 1.3/1.4/1.5 (parallel) → 1.6 → 1.7 → 1.8 (M1 gate).
- M1 → 2.1 → 2.2 → 2.3 (M2 gate).
- M2 → 3.1/3.2/3.3 (parallel) → 3.4 → 3.5 → 3.6 → 3.7.

## Timeline & Estimates
**When will things be done?**

- M1 ~ core; M2 ~ CLI; M3 ~ test/doc/ship. Sequential within milestone; TDD where it adds value
  (service/store logic), validation-after for boilerplate.

## Risks & Mitigation
**What could go wrong?**

- **Monorepo build wiring** (`@ai-devkit/` workspace dep) → Mitigation: mirror memory's exact
  package.json/project.json shape; verify `nx build cli` resolves the new dep.
- **Overbuilding** (project-management creep) → Mitigation: no hierarchy/boards/permissions;
  MVP scope only.

## Resources Needed
**What do we need to succeed?**

- Existing `@ai-devkit/memory` package as the structural template.
- `ui`/`withErrorHandler`/`ConfigManager` CLI utilities (reuse, don't rebuild).

## Notes
- Keep `Task`/`TaskEvent` fields and event-type strings stable for consumers.
- Use the existing `.worktrees/feature-task-system` worktree; branch `feature-task-system`.
