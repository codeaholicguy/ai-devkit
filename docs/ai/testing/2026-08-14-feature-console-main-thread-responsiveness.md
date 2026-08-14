---
phase: testing
title: Shared Process Snapshot Testing
description: Deterministic validation of shared asynchronous discovery
---

# Testing Strategy

## Unit and Integration Scenarios

- [x] Manager shares one snapshot across multiple snapshot-aware adapters.
- [x] Legacy adapters remain callable without a discovery context.
- [x] Process capture uses asynchronous child-process execution and one base scan.
- [x] Relevant executable filtering includes `.exe` and shared `node` candidates.
- [x] Async enrichment preserves partial data and Linux `pwdx` fallback.
- [x] Direct built-in adapter calls remain compatible.
- [x] Existing adapter failure, sorting, registry, and session tests remain green.

## Non-Flaky Proof

Mock callback-based child-process boundaries and assert invocation/order/data flow. Do not use elapsed-time thresholds.

## Validation Commands

- Focused/new agent-manager tests.
- Full agent-manager tests, lint, and build.
- Focused CLI console tests.
- Full CLI tests, lint, and build.
- Root full test, lint, and build commands.

## Current Evidence

- Red: manager capture count was 0; async utility was missing.
- Green: focused manager/process tests pass (56 tests).
- Adapter regression: all seven adapter files pass (294 tests).
- Regression gate: test fails with manager capture removed and passes after restoration.
- Agent-manager full: 24 files / 506 tests passed; lint, typecheck, and build exit 0.
- CLI console focused: 20 files / 125 tests passed.
- CLI full: 79 files / 959 tests passed; lint and build exit 0.
- Repository full: all six projects passed serial tests, lint, and build with exit 0. Lint reports six existing warnings and zero errors.
- Feature/base lifecycle lint passed.
