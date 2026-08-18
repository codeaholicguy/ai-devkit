---
phase: testing
title: Durable Agents SQLite Testing Strategy
description: Behavioral parity, migration, concurrency, and recovery validation
---

# Durable Agents SQLite Testing Strategy

## Test Coverage Goals

Cover all changed persistence and connection branches with focused unit/integration tests, retain critical end-to-end service flows, and finish with the complete workspace gates. Every new behavior begins with a failing test.

## Schema and Connection

- [x] Migration 003 creates the flattened table, constraints, indexes, and expected `user_version`.
- [x] Names are unique case-insensitively; provider values remain extensible.
- [x] State, health, result, and active-field consistency constraints reject invalid rows.
- [x] Readonly open of an already-migrated DB performs no initialization/write and lists successfully.
- [x] Readonly open without a usable schema throws a clear error.

## Store Behavioral Parity

- [x] Identity creation and provider session identity persist across reopen.
- [x] Case-insensitive name conflicts map to `PrintAgentNameConflictError`.
- [x] Cwd is canonical, safe, and protected against symlink rebinding.
- [x] Busy ownership, stale-token rejection, provider-liveness recovery, and interrupted-run reconciliation match current behavior.
- [x] Session resume remains covered by `ClaudePrintAgent.integration.test.ts`.
- [x] Latest result behavior and the 4,096-character summary cap remain intact.

## Migration and Compatibility

- [x] Valid version-1 JSON imports once and is renamed after commit.
- [x] Malformed, wrong-version, symlinked, or invalid-agent JSON aborts with no partial rows/marker and leaves the source intact.
- [x] Marker plus absent JSON makes later opens a no-op.
- [x] Injected JSON `filePath` maps to its test `agents.db`; explicit `dbPath` takes precedence.
- [x] Deprecated lock options remain accepted but do not create lock artifacts.

## Concurrency and Recovery

- [x] Two connections racing acquisition yield exactly one owner and one busy result.
- [x] Record-provider and completion reject a stale/lost token.
- [x] Reconcile CAS cannot overwrite ownership changed after process inspection.
- [x] Transaction rollback leaves the database reopenable after interruption.
- [x] Corrupt database errors map to a clear store error.
- [x] Readonly `list()` does not reconcile or mutate running rows.

## Full Validation

- [x] Focused agent-manager test suite passes (26 files, 552 tests).
- [x] Coverage is reviewed: `PrintAgentStore.ts` reports 90.5% lines and 97.36% functions; remaining branches are defensive platform/storage failures.
- [x] Full workspace test suite passes (1,019 tests).
- [x] Workspace lint passes (existing warnings only, zero errors).
- [x] Workspace typecheck passes for all five typed projects.
- [x] Workspace build passes for all six projects.
- [x] `npx ai-devkit@latest lint --feature durable-agents-sqlite` passes.

Fresh evidence was collected on 2026-08-18 with `npm run test:coverage --workspace @ai-devkit/agent-manager`, `npm test`, `npm run lint`, `npx nx run-many -t typecheck`, `npm run build`, and the feature lint command; every command exited 0.

## Test Data and Fixtures

Tests use isolated temporary directories, real SQLite databases, controlled process-inspector doubles, version-1 JSON fixtures, deliberate malformed/corrupt files, and independent store/connection instances for races. No user home state is read or modified.

## Manual Testing

No UI changes exist. Automated integration coverage exercises the user-visible durable-agent lifecycle and migration path.
