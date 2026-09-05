---
phase: planning
title: Remote Built-in Skills Manifest Plan
description: Ordered TDD tasks for the manifest loader and four consumers
---

# Remote Built-in Skills Manifest Plan

## Milestones

- [x] Milestone 1: Manifest loader is specified and implemented with fallback semantics.
- [x] Milestone 2: All four built-in consumers use runtime names.
- [ ] Milestone 3: Documentation and full verification gates are complete.

## Task Breakdown

### Phase 1: Manifest and loader

- [x] Task 1.1: Add loader tests for a valid bare array and one-fetch promise caching. Evidence: focused loader test fails before implementation and passes afterward.
- [x] Task 1.2: Add loader tests for HTTP, parse, and invalid-shape fallback behavior, including empty, blank, duplicate, and invalid names. Dependency: Task 1.1. Evidence: focused tests.
- [x] Task 1.3: Add `skills/built-in.json` with the current 21 names from the latest base and implement the minimal loader. Dependency: failing tests. Evidence: focused tests and manifest parsing.

### Phase 2: Consumer migration

- [x] Task 2.1: Migrate `skill add --built-in` and setup using mocked runtime lists. Dependency: loader API. Evidence: focused command/service tests.
- [x] Task 2.2: Migrate init so the list is resolved only for a triggered built-in flow. Dependency: loader API. Evidence: focused init tests, including no-fetch skip behavior.
- [x] Task 2.3: Migrate status to report fixture-driven live counts and fallback warnings. Dependency: loader API. Evidence: focused status tests.
- [x] Task 2.4: Delete the compiled primary list and unused literal union; confirm no remaining references. Dependency: all consumers migrated. Evidence: `rg` and build.

### Phase 3: Verification and publication

- [ ] Task 3.1: Reconcile implementation/testing docs and perform design-alignment review. Evidence: feature lint and diff review.
- [ ] Task 3.2: Run `npm run build`, `npm test`, `npm run lint`, and E2E; fix regressions. Evidence: fresh exit-zero output.
- [ ] Task 3.3: Create logical commits, rebase onto latest `origin/main`, rerun gates, push, and open the PR. Evidence: clean branch and PR URL.

## Dependencies and Risks

- Remote `main` may list a skill before its directory is available. Maintainers should land the directory and manifest atomically; `SkillManager` gives a clear not-found error.
- A rejected manifest uses the embedded fallback as one complete set; partial remote data is never installed.
- Existing tests with literal `20/20` output must use injected fixture counts where they test rendering rather than policy.
- All test suites must mock manifest fetches to preserve determinism.

## Progress Summary

The loader, manifest, and four consumers are implemented through TDD. The latest base added `ai-devkit-setup` after the original brief, so the manifest and safe fallback preserve the current 21-name set rather than regressing offline setup. Focused verification passed 97 tests across seven files, and the CLI package build passed. Full gates and final review remain.
