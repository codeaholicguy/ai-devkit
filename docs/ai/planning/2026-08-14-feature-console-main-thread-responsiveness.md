---
phase: planning
title: Shared Process Snapshot Plan
description: Test-first implementation plan for responsive agent refreshes
---

# Project Planning & Task Breakdown

## Task Queue

- [x] `done` Add deterministic failing manager/process tests for one shared snapshot and async discovery.
- [x] `done` Implement asynchronous process capture and enrichment with platform fallbacks.
- [x] `done` Add optional adapter discovery context and migrate all built-in adapters.
- [x] `done` Preserve and test failure, sorting, registry, direct-adapter, and export compatibility.
- [x] `done` Validate agent-manager and CLI focused/full tests, lint, and builds.
- [ ] `todo` Commit, rebase on `origin/main`, push, and open a PR without merging.

## Dependencies

Tests define the public boundary before production changes. Utility implementation precedes adapter migration; full validation precedes commit and publication.

## Risks & Mitigation

- Direct adapter callers could break: make context optional and capture asynchronously when absent.
- Third-party adapters could receive an incomplete snapshot: only pass context to adapters advertising process names.
- Concurrent mutation could leak across adapters: expose a read-only snapshot and filter into new arrays.
- Platform fallback could regress: retain command shapes and best-effort empty/partial results.

## Progress Summary

Implementation and validation are complete with no scope changes or blockers. One concurrent root run exposed the existing 5-second print integration timeout under cross-project contention; the full suite passed serially without changing thresholds. Remaining work is publication only: commit, rebase, push, and open the PR.
