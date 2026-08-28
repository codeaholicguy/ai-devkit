---
phase: planning
title: Registry preparation implementation plan
description: TDD task breakdown for one preparation per registry instance
---

# Registry preparation implementation plan

## Milestone 1: Core behavior

- [x] Add failing sequential same-registry and concurrent preparation tests. Evidence: 6 of 7 new tests failed before production changes because operations repeated.
- [x] Add `preparedRepositories`, storing the promise before await, and extract `refreshOrUseStaleCache`. Evidence: focused registry/manager suites pass 80 tests.
- [x] Cover independent registries, stale fallback, terminal no-cache failure, second-instance freshness, and non-Git cache reuse. Evidence: registry suite passes 7 tests.

## Milestone 2: UX and command coverage

- [x] Move cache-check messaging from `SkillManager` into the first registry preparation and assert start/success/stale output once.
- [x] Add or strengthen command/service coverage for init built-ins, mixed-registry templates, mixed-registry install, `skill add --built-in`, and setup. Evidence: four caller suites pass 79 tests.
- [ ] Evaluate `fetchMergedRegistry` instance memoization independently; implement in a separate commit only if a focused red/green test and clear failure semantics remain isolated.

## Milestone 3: Lifecycle completion

- [ ] Reconcile implementation/testing docs and verify design alignment.
- [ ] Run focused tests, build (6 projects), full tests, lint, feature lint, and e2e.
- [ ] Complete final review, create logical conventional commits, rebase on fetched `origin/main`, push, and open a PR.

## Dependencies and Risks

- Reuse existing Git/filesystem mocks in `SkillManager.test.ts`.
- Retaining rejected promises is intentional and must not cause unhandled rejections.
- PR #202 may later redirect init through install; registry-local behavior requires no caller migration.
- Command mocks may not exercise real Git calls; unit tests provide exact operation-count evidence.

## Progress Summary

Core implementation and caller coverage are complete. Next: independently evaluate merged-catalog memoization, then full validation and review.
