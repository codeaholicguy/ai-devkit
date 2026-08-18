---
phase: testing
title: Durable Agents SQLite Testing Strategy
description: Behavioral parity, migration, concurrency, and recovery validation
---

# Durable Agents SQLite Testing Strategy

## Test Coverage Goals

Cover all changed persistence and connection branches with focused unit/integration tests, retain critical end-to-end service flows, and finish with the complete workspace gates. Every new behavior begins with a failing test.

## Schema and Connection

- [ ] Migration 003 creates the flattened table, constraints, indexes, and expected `user_version`.
- [ ] Names are unique case-insensitively; provider values remain extensible.
- [ ] State, health, result, and active-field consistency constraints reject invalid rows.
- [ ] Readonly open of an already-migrated DB performs no initialization/write and lists successfully.
- [ ] Readonly open without a usable schema throws a clear error.

## Store Behavioral Parity

- [ ] Identity creation and provider session identity persist across reopen.
- [ ] Case-insensitive name conflicts map to `PrintAgentNameConflictError`.
- [ ] Cwd is canonical, safe, and protected against symlink rebinding.
- [ ] Busy ownership, stale-token rejection, provider-liveness recovery, and interrupted-run reconciliation match current behavior.
- [ ] Session resume remains covered by `ClaudePrintAgent.integration.test.ts`.
- [ ] Latest result behavior and the 4,096-character summary cap remain intact.

## Migration and Compatibility

- [ ] Valid version-1 JSON imports once and is renamed after commit.
- [ ] Malformed, wrong-version, symlinked, or invalid-agent JSON aborts with no partial rows/marker and leaves the source intact.
- [ ] Marker plus absent JSON makes later opens a no-op.
- [ ] Injected JSON `filePath` maps to its test `agents.db`; explicit `dbPath` takes precedence.
- [ ] Deprecated lock options remain accepted but do not create lock artifacts.

## Concurrency and Recovery

- [ ] Two connections racing acquisition yield exactly one owner and one busy result.
- [ ] Record-provider and completion reject a stale/lost token.
- [ ] Reconcile CAS cannot overwrite ownership changed after process inspection.
- [ ] Transaction rollback leaves the database reopenable after interruption.
- [ ] Corrupt database errors map to a clear store error.
- [ ] Readonly `list()` does not reconcile or mutate running rows.

## Full Validation

- [ ] Focused agent-manager test suite passes.
- [ ] Coverage is reviewed for changed files and gaps are closed or documented.
- [ ] Full workspace test suite passes.
- [ ] Workspace lint passes.
- [ ] Workspace typecheck passes.
- [ ] Workspace build passes.
- [ ] `npx ai-devkit@latest lint --feature durable-agents-sqlite` passes.

## Test Data and Fixtures

Tests use isolated temporary directories, real SQLite databases, controlled process-inspector doubles, version-1 JSON fixtures, deliberate malformed/corrupt files, and independent store/connection instances for races. No user home state is read or modified.

## Manual Testing

No UI changes exist. Automated integration coverage exercises the user-visible durable-agent lifecycle and migration path.
