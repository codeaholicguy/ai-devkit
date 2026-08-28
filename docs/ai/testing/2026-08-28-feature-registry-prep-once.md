---
phase: testing
title: Registry preparation testing strategy
description: Unit, command, integration, and regression evidence
---

# Registry preparation testing strategy

## Coverage Goal

Cover 100% of new branches and all approved freshness/failure semantics. Mock Git and filesystem boundaries for deterministic operation counts; retain command/service tests for caller integration.

## Unit Tests

- [x] Two sequential skills from one registry cause one pull.
- [x] Concurrent preparations share one in-flight pull.
- [x] Two registries prepare independently once each.
- [x] Failed refresh with an existing cache warns once and reuses stale contents without retry.
- [x] Failed clone without a cache rejects later calls without retry.
- [x] A second `SkillRegistry`/`SkillManager` instance refreshes again.
- [x] A non-Git cached registry is accepted and reported once.
- [x] Refresh start/success outcomes appear once and `Checking local cache...` is absent.

## Command and Service Tests

- [x] `init --built-in` uses one `SkillManager` for the curated set.
- [x] Template init with repeated and mixed registries uses one manager; registry tests prove per-ID preparation.
- [x] Install reconciliation with mixed registries uses one manager; registry tests prove per-ID preparation.
- [x] `skill add --built-in` uses one manager and reuses its registry preparation.
- [x] Setup invokes one built-in installer per agent; its manager loop inherits the registry guarantee.

## Regression and E2E

- [ ] Focused CLI tests pass.
- [ ] `npm run build` succeeds for 6 projects.
- [ ] Full `npm test` passes.
- [ ] `npm run lint` passes.
- [ ] `npx ai-devkit@latest lint --feature registry-prep-once` passes.
- [ ] `npx vitest run --config e2e/vitest.config.ts` passes.
- [x] Regression proof: core test passes with fix, fails with two pulls when the fix is reverted, and passes after restoration.

## Fixtures

Reuse temporary cache paths and mocked `pullRepository`, `cloneRepository`, `isGitRepository`, filesystem, and terminal UI from existing CLI tests. No live registry mutation or network timing benchmark is required.

## Results

Focused registry/manager suites: 80 passed. Caller suites: 79 passed. Full validation remains pending.
