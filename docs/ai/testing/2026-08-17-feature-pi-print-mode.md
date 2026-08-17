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

- [ ] S1 Pi agents start with a null provider session while Claude retains an assigned UUID.
- [ ] S2 version-1 Claude stores load and migrate to version 2 on mutation.
- [ ] S3 an owned Pi run binds one valid UUID idempotently.
- [ ] S4 binding rejects invalid UUIDs, ownership changes, non-Pi agents, mismatches, and duplicate provider bindings.
- [ ] S5 malformed provider-discriminated records are rejected.

### Pi CLI Probe

- [ ] S6 supported Pi help/version returns sanitized metadata.
- [ ] S7 missing flags produce an unsupported-capability error.
- [ ] S8 execution failures produce a sanitized unavailable error.

### Pi JSON Runner

- [ ] S9 first-run args are `--mode json`; resume adds `--session <uuid>`; prompt uses stdin and shell is disabled.
- [ ] S10 provider process identity and session callbacks run.
- [ ] S11 the session header and completed assistant message yield the final result.
- [ ] S12 multiple assistant completions return the last complete message.
- [ ] S13 missing/invalid/duplicate/mismatched session identity is rejected.
- [ ] S14 malformed, non-object, oversized, or incomplete JSON is rejected.
- [ ] S15 missing `agent_end` or assistant output is rejected.
- [ ] S16 spawn identity/start errors and callback failures terminate safely.
- [ ] S17 non-zero/signal exits become process errors.
- [ ] S18 stderr is drained without inclusion in results.

## Integration Tests

- [ ] S19 service create probes and persists provider `pi`.
- [ ] S20 first send records process/session, success, health, and sanitized summary.
- [ ] S21 resumed send preserves the bound session.
- [ ] S22 missing/ambiguous/wrong-provider references fail clearly.
- [ ] S23 protocol/store session mismatches record mismatch health.
- [ ] S24 other failures record unknown health and release the run.

## CLI and End-to-End Tests

- [ ] S25 `agent start --type pi --mode print` creates without interactive launch.
- [ ] S26 unsupported print providers and modes remain rejected.
- [ ] S27 `agent send` dispatches Pi records to the Pi service and reports provider `pi`.
- [ ] S28 list/detail output identifies Pi print agents and nullable pre-first-run sessions safely.
- [ ] S29 console receives the combined interactive/print registry.
- [ ] S30 Claude print start/send/list/detail behavior remains green.

## Test Data

Use temporary store/cwd fixtures, deterministic clocks/process identities, valid UUID fixtures, mocked child-process streams, and mocked probe/runner/store boundaries. Never invoke a live model.

## Test Reporting & Coverage

- Targeted: `npx vitest run <changed test files>` in relevant packages.
- Coverage: package Vitest coverage scoped to Pi pure-logic files with 100% thresholds.
- Regression: `npm test --workspace @ai-devkit/agent-manager` and CLI equivalent.
- Static: package lint/typecheck/build and `npx ai-devkit@latest lint --feature pi-print-mode`.

## Manual Testing

No credentialed Pi model run is required. `pi --help` and installed docs provide CLI-surface evidence; subprocess behavior is deterministic under mocks.

## Performance and Security Testing

Oversized-line tests exercise the memory bound. Spawn assertions cover `shell: false`, cwd binding, stdin prompt delivery, stderr draining, and provider-output sanitization.

## Bug Tracking

Any failing scenario returns to its implementation task, is added as a regression test first, and is documented in implementation notes.
