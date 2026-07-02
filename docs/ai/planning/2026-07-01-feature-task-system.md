---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown — Task System

## Milestones
**What are the major checkpoints?**

- [x] **M1 — Core package + SQLite repository.** `@ai-devkit/task-manager` with types,
      `TaskService`, `TaskRepository`, WAL/migrations, append-only events.
- [x] **M2 — Plugin CLI surface.** `ai-devkit task ...` provided by the optional
      `@ai-devkit/task-manager` plugin; `--json` + attribution.
- [x] **M3 — Tests, docs, simplify, validate.** Unit + integration coverage, README, simplify
      pass, green build/lint/test, commit, PR.

## Task Breakdown
**What specific work needs to be done?**

### M1: Core package + SQLite repository
- [ ] **1.1 Scaffold package.** `packages/task-manager/{package.json, tsconfig.json,
      project.json, vitest.config.ts, .eslintrc.json, .swcrc, .gitignore}` mirroring
      `@ai-devkit/memory`. Name `@ai-devkit/task-manager`, `type: module`, strict TS.
      Validation: `nx lint task-manager` runs (even if no src yet).
- [ ] **1.2 Types module** (`src/task.types.ts`). `Actor`, `TaskStatus`, `LifecyclePhase`,
      `TaskProgress`, `TaskLinks`, `TaskBlocker`, `TaskEvidence`, `TaskArtifact`, `Task`,
      `TaskEventType` (closed union), `TaskEvent`. Type names per the design doc.
- [ ] **1.3 Errors** (`src/task.errors.ts`). `TaskError` base, `TaskNotFoundError`,
      `TaskValidationError`, `AmbiguousTaskRefError`, `TaskRepositoryError`.
- [ ] **1.4 IDs + time helpers** (`src/task.ids.ts`). `taskId`/`eventId`/`blockerId`/`evidenceId`/
      `artifactId` generators (raw UUIDv4 via Node `crypto.randomUUID()`).
- [ ] **1.5 Explicit actor handling**. Mutators accept caller-supplied actor metadata and store
      `null` when omitted. Skills provide actor details when they have useful running-agent
      context.
- [ ] **1.6 TaskRepository + database layer** (`src/task.repository.ts`,
      `src/database/`). `TaskRepository`: `exists`, `readTask`, `writeTask`,
      `listTaskIds`, `readEvents`, `appendEvent`. (Id generation lives in the service, not the
      repository — mirroring memory.)
      `database/{connection,schema,migrations}` mirrors `@ai-devkit/memory` (WAL, busy_timeout,
      versioned migrations via `user_version`).
- [ ] **1.7 TaskService** (`src/task.service.ts`). All service methods; delegates to the repository;
      applies snapshot mutation per event type; records explicit actor metadata; `resolveTask`
      (full id → unique prefix → feature→latest non-terminal).
- [ ] **1.8 Package index** (`src/index.ts`). Export types + `TaskService` + `TaskRepository` +
      CLI option interfaces (`TaskCreateOptions`, etc.) for the CLI layer, so consumers import
      via `@ai-devkit/task-manager`.

### M2: CLI surface
- [x] **2.1 Plugin manifest wire.** Add `aiDevkit.commands` to
      `packages/task-manager/package.json` so the host plugin loader registers `task` only when
      the package is installed/enabled.
- [x] **2.2 task command** (`packages/task-manager/src/command.ts`). All verbs/flags from the
      design doc; `--json`, `--db-path`, `--agent*` globals; `<id>` via `resolveTask`.
- [ ] **2.3 Output formatting.** `list` table (id/title/status/phase/feature), `show`
      pretty + `--events`, `--json` machine output everywhere.

### M3: Tests, docs, simplify, validate
- [x] **3.1 Unit tests** (`packages/task-manager/tests/unit/`). ids,
      service mutation-per-event, resolveTask resolution order, validation errors.
- [x] **3.2 Integration tests** (`tests/integration/`). TaskRepository round-trip,
      migrations, append-only events, addEvent escape hatch coverage, repository error branches.
- [x] **3.3 Plugin command tests** (`packages/task-manager/tests/command.test.ts`) covering
      command registration, parsing, output, and DB path resolution with a mocked TaskService.
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
  (service/repository logic), validation-after for boilerplate.

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
