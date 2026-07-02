---
phase: testing
title: Testing Strategy
description: Define test coverage, scenarios, and quality gates
---

# Testing Strategy — Task System

## Test Plan

Unit, integration, and plugin command coverage live in `packages/task-manager/tests/`.

### Scenarios (mapped to requirements success criteria)

- [x] Task created with stable id + `task.created` event — `service.test.ts`
- [x] create validation (empty title, bad feature key, null feature, initial phase) — `service.test.ts`
- [x] setPhase/setStatus/setProgress/setNextStep mutate snapshot + emit typed events — `service.test.ts`
- [x] status enum validation; percent range validation — `service.test.ts`
- [x] addBlocker → resolveBlocker; unknown blocker error — `service.test.ts`
- [x] addEvidence requires boolean `passed`; records command/exitCode/summary — `service.test.ts`
- [x] addArtifact stores path reference only (never copies file contents) — `service.test.ts`
- [x] setAttribution sets current owner — `service.test.ts`
- [x] addNote is event-only (no state mutation) — `service.test.ts`
- [x] close emits task.closed; idempotent on terminal task — `service.test.ts`
- [x] resolveTask: full id / unique prefix / feature→latest non-terminal / ambiguous error / null — `service.test.ts`
- [x] list filters + deterministic newest-first ordering — `service.test.ts`
- [x] addEvent escape hatch applies every stateful type; task.custom is event-only; unknown type rejected — `add-event-coverage.test.ts`
- [x] getEvents filter by type + limit — `service.test.ts`
- [x] TaskRepository round-trip, upsert, append-only events (insertion order), schema init — `task.repository.test.ts`
- [x] repository error branches wrapped as TaskRepositoryError (corrupt snapshot/payload, invalid path) — `task.repository.test.ts`, `add-event-coverage.test.ts`
- [x] raw UUID id format + uniqueness — `task.ids.test.ts`
- [x] explicit actor metadata is recorded and omitted actor stays `null` — `service.test.ts`, `command.test.ts`
- [x] error hierarchy + isTaskEventType guard — `errors.test.ts`
- [x] Plugin CLI verbs parse flags, resolve refs, print JSON/table, error on bad input — `command.test.ts`
- [x] Plugin CLI resolves task DB path from `.ai-devkit.json` `tasks.path`; `--db-path` overrides config — `command.test.ts`
- [x] Package declares the `task` plugin command manifest — `plugin-package.test.ts`
- [x] Plugin command DB path resolution handles missing, blank, absolute, and relative
  `.ai-devkit.json` `tasks.path` values — `command.test.ts`
- [x] Task package DB resolution uses only explicit `dbPath` or `~/.ai-devkit/tasks.db` fallback — `task.repository.test.ts`

### Mocks / Fixtures
- Command tests mock `packages/task-manager/src/index.ts` so command parsing is isolated from
  SQLite and service behavior.
- Integration tests use a real `TaskRepository` against a per-test temp SQLite DB
  (`mkdtempSync` + `tasks.db`); the shared `getDatabase()` singleton is reset with
  `closeDatabase()` in `beforeEach`/`afterEach`, and the temp dir is removed in `afterEach`.

## Coverage Target

vitest v8; package thresholds statements/branches/functions/lines ≥ 75%.
`packages/task-manager` meets: statements ~94%, branches ~79%, functions ~99%, lines ~94%.

## Test Files
- `packages/task-manager/tests/unit/ids.test.ts`
- `packages/task-manager/tests/unit/errors.test.ts`
- `packages/task-manager/tests/integration/task.repository.test.ts`
- `packages/task-manager/tests/integration/service.test.ts`
- `packages/task-manager/tests/integration/add-event-coverage.test.ts`
- `packages/task-manager/tests/command.test.ts`
- `packages/task-manager/tests/plugin-package.test.ts`
- `packages/cli/src/__tests__/lib/Config.test.ts`

## Results
- `nx test task-manager`: 110 passing, 0 failing (7 test files).
- `nx test cli`: 871 passing, 0 failing (72 test files).
- `nx build task-manager`: succeeds.
- `nx build cli`: succeeds, including dependent package builds.
- `nx lint task-manager`: 0 errors.
- `nx lint cli`: 0 errors (only pre-existing warnings).
