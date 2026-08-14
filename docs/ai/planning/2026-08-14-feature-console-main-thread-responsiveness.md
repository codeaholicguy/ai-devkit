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
- [x] `done` Correct PR review findings: per-adapter snapshot slicing, defensive adapter filtering, async buffer options, and Windows path normalization.
- [x] `done` Commit and push the review fix to the existing PR without merging.

## Dependencies

Tests define the public boundary before production changes. Utility implementation precedes adapter migration; full validation precedes commit and publication.

## Risks & Mitigation

- Direct adapter callers could break: make context optional and capture asynchronously when absent.
- Third-party adapters could receive an incomplete snapshot: only pass context to adapters advertising process names.
- Concurrent mutation could leak across adapters: expose a read-only snapshot and filter into new arrays.
- Platform fallback could regress: retain command shapes and best-effort empty/partial results.

## Progress Summary

The review fix and fresh validation are complete with no blockers. The restricted sandbox could not inspect the current process for one print integration, so the full suite was rerun with process-inspection access and passed. The reviewed implementation is ready on the existing PR branch.
