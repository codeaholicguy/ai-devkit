---
phase: testing
title: Pi Print Mode Testing Strategy
description: Unit, integration, CLI, and regression coverage for Pi print agents
---

# Pi Print Mode Testing Strategy

## Test Coverage Goals

- 100% statements, branches, functions, and lines for new pure probe/protocol/argument-mapping logic.
- Mocked subprocess tests; no model credentials or network calls.
- Mocked-store service integration tests for every state transition.
- CLI command tests for critical creation and dispatch flows.
- Full Claude print regression coverage and package typecheck/build.

## Unit Tests

### Store and Types

- [x] S1 Pi and Claude agents receive non-null provider sessions at creation while Codex starts null.
- [x] S2 migration 004 preserves existing Claude rows while permitting deferred Codex sessions.
- [x] S3 Pi first-run arguments use the repository-assigned UUID and verify the emitted session identity.
- [x] S4 Codex-only session binding remains unavailable to Pi; Pi identity mismatches fail in the runner.
- [x] S5 malformed provider-discriminated records, including null Pi sessions, are rejected.

### Pi CLI Probe

- [x] S6 supported Pi help/version returns sanitized metadata.
- [x] S7 missing flags produce an unsupported-capability error.
- [x] S8 execution failures produce a sanitized unavailable error.

### Pi JSON Runner

- [x] S9 first-run args are `--mode json`; resume adds `--session <uuid>`; prompt uses stdin and shell is disabled.
- [x] S10 provider process identity and session callbacks run.
- [x] S11 the session header and completed assistant message yield the final result.
- [x] S12 multiple assistant completions return the last complete message.
- [x] S13 missing/invalid/duplicate/mismatched session identity is rejected.
- [x] S14 malformed, non-object, oversized, or incomplete JSON is rejected.
- [x] S15 missing `agent_end` or assistant output is rejected.
- [x] S16 spawn identity/start errors and callback failures terminate safely.
- [x] S17 non-zero/signal exits become process errors.
- [x] S18 stderr is drained without inclusion in results.

## Integration Tests

- [x] S19 service create probes and persists provider `pi`.
- [x] S20 first send records process/session, success, health, and sanitized summary.
- [x] S21 resumed send preserves the bound session.
- [x] S22 missing/ambiguous/wrong-provider references fail clearly.
- [x] S23 protocol/store session mismatches record mismatch health.
- [x] S24 other failures record unknown health and release the run.

## CLI and End-to-End Tests

- [x] S25 `agent start --type pi --mode durable` creates without interactive launch.
- [x] S26 unsupported durable providers and the retired `print` mode name remain rejected.
- [x] S27 `agent send` dispatches Pi records to the Pi service and reports provider `pi`.
- [x] S28 list/detail output identifies durable Pi agents and their repository-assigned sessions.
- [x] S29 console receives the combined interactive/durable registry.
- [x] S30 Claude print start/send/list/detail behavior remains green.

## Test Data

Use temporary store/cwd fixtures, deterministic clocks/process identities, valid UUID fixtures, mocked child-process streams, and mocked probe/runner/store boundaries. Never invoke a live model.

## Test Reporting & Coverage

- Targeted: `npx vitest run <changed test files>` in relevant packages.
- Coverage: package Vitest coverage scoped to Pi pure-logic files with 100% thresholds.
- Regression: `npm test --workspace @ai-devkit/agent-manager` and CLI equivalent.
- Static: package lint/typecheck/build and `npx ai-devkit@latest lint --feature pi-print-mode`.

Final evidence (2026-08-17):

- Agent manager: 28 files, 552 tests passed.
- CLI: 82 files, 986 tests passed.
- Pi focused suites: 4 files, 23 tests passed.
- Pure Pi protocol: 100% statements (26/26), branches (38/38), functions (4/4), and lines (20/20), enforced with `--coverage.thresholds.100=true`.
- Agent-manager and CLI package builds passed; package lints passed (CLI retains five unrelated baseline warnings and zero errors).
- Feature-doc lint passed all base, feature, branch, and worktree checks.

## Manual Testing

No credentialed Pi model run is required. `pi --help` and installed docs provide CLI-surface evidence; subprocess behavior is deterministic under mocks.

## Performance and Security Testing

Oversized-line tests exercise the memory bound. Spawn assertions cover `shell: false`, cwd binding, stdin prompt delivery, stderr draining, and provider-output sanitization.

## Bug Tracking

Any failing scenario returns to its implementation task, is added as a regression test first, and is documented in implementation notes.
