---
phase: testing
title: Console In-Process Actions Testing
description: TDD coverage and validation evidence
---

# Console In-Process Actions Testing

## Required Scenarios

- [x] Each console action invokes its injected application service directly.
- [x] No console action runner starts a fresh CLI process.
- [x] Direct services cannot write CLI reporter output into the Ink terminal.
- [x] Pending feedback is emitted synchronously before a deferred action settles.
- [x] Sending renders `Sending`; opening renders `Opening`; channel stop renders `Stopping channel`.
- [x] Duplicate submission for a pending action is suppressed.
- [x] Submission can retry after success or error settlement.
- [x] Successful actions preserve existing console feedback and refresh behavior.
- [x] Service errors preserve useful messages and existing CLI output/exit behavior.
- [x] User-controlled values remain structured and reach the expected service dependency.

## Validation Commands

- Focused action/service/pending tests.
- `npm test --workspace packages/cli`
- `npm run lint --workspace packages/cli`
- `npm run build --workspace packages/cli`
- `npx ai-devkit@latest lint --feature console-in-process-actions`

## Evidence

- TDD red run: 2 files failed; all seven direct-dispatch assertions observed zero service calls, and pending behavior was absent.
- Pending/action unit tests: 2 files, 20 tests passed.
- Focused command/action regression: 4 files, 114 tests passed.
- Focused console action/hook regression: 5 files, 33 tests passed.
- Full CLI suite: 80 files, 967 tests passed, exit 0.
- CLI lint: exit 0 with five pre-existing warnings, zero errors.
- CLI build: exit 0; SWC compiled 197 files and declaration generation completed.
- Feature-doc lint: exit 0; all required feature documents and worktree checks passed.
