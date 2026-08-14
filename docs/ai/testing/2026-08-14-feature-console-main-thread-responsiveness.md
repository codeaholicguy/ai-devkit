---
phase: testing
title: Shared Process Snapshot Testing
description: Deterministic validation of shared asynchronous discovery
---

# Testing Strategy

## Unit and Integration Scenarios

- [x] Manager captures one union snapshot and dispatches only each adapter's declared executable slice.
- [x] Foreign Codex/Claude path arguments cannot reach Gemini/Pi broad token matchers.
- [x] Legacy adapters remain callable without a discovery context.
- [x] Process capture uses asynchronous child-process execution and one base scan.
- [x] Relevant executable filtering includes `.exe` and shared `node` candidates.
- [x] Windows separators are normalized consistently in capture, manager slicing, and adapter matching.
- [x] Async child-process calls set an explicit buffer and do not pass unsupported `stdio` options.
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

- Review red: six deterministic failures proved full-union leakage, missing shared filtering, missing async `maxBuffer`, and Windows-path rejection.
- Review green: focused manager/process/Pi/Gemini tests pass (131 tests).
- Adapter regression: all seven adapter files pass (296 tests).
- Regression gate: the foreign-argument test fails when manager slicing is removed and passes after restoration.
- Agent-manager full: 24 files / 510 tests passed; lint, typecheck, and build exit 0.
- CLI agent/console focused: 23 files / 207 tests passed.
- CLI full: 81 files / 967 tests passed; lint and build exit 0.
- Repository full: all six projects passed serial tests, lint, and build with exit 0. Lint reports six existing warnings and zero errors.
- Feature/base lifecycle lint passed.
