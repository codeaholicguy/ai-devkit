---
phase: testing
title: Codex Print-Mode Agent Testing Strategy
description: Offline TDD, protocol, integration, and compatibility validation
---

# Codex Print-Mode Agent Testing Strategy

## Test Coverage Goals

- 100% coverage for all new pure/unit logic, including provider-specific parsing and binding branches.
- Offline fake-provider integration for every critical success and failure path.
- Full agent-manager, CLI, and repository regression suites; no real model invocation.

## Unit Tests

### Domain and store

- [ ] Claude and Codex records coexist with provider-specific nullable invariants.
- [ ] Provider-aware create gives Claude a UUID and Codex `null`/`uninitialized` without spawning.
- [ ] Legacy Claude schema remains readable; malformed/provider-invalid records remain rejected.
- [ ] Binding requires the owned run token, validates UUID, supports null-to-value and identical idempotence, and rejects replacement.
- [ ] Duplicate non-null provider/session bindings are rejected across records; provider namespaces remain distinct.
- [ ] Existing atomic writes, canonical cwd, concurrency, and stale-lock recovery remain green.

### Codex capability probe and errors

- [x] Probe invokes exactly `--version`, `exec --help`, and `exec resume --help`.
- [x] Probe validates `exec`, `resume`, `--json`, and stdin `-`; failures are bounded/sanitized and never invoke a model.
- [x] Error codes cover protocol, process, session mismatch, unsupported, and missing result.

### Codex runner

- [x] Initial argv is `exec --json -`; resume argv is `exec resume --json UUID -`; prompt is absent from argv.
- [x] `shell: false`, exact canonical cwd, provider identity before stdin, and prompt-only stdin are enforced.
- [x] Chunked/multi-event JSONL and multiple assistant messages are parsed in order; unknown object events are tolerated.
- [x] Success requires matching `thread.started`, assistant result, `turn.completed`, clean termination, and exit zero.
- [x] Invalid UUID, mismatch, malformed/non-object/oversized/truncated line, missing identity/result/completion, and non-zero exit fail.
- [x] Secret-looking stderr and prompt content never appear in persisted/displayed errors.

### Codex service and CLI

- [x] First send binds during the owned run and completes healthy; second send resumes exact UUID.
- [x] Session mismatch becomes degraded/mismatch; unsupported provider becomes degraded/unknown; no retry occurs.
- [x] Start accepts Codex print and keeps omitted/explicit interactive behavior unchanged.
- [x] List/detail render `Codex (print)` and `not started`; JSON provider comes from the record.
- [x] Exact-ID precedence, cross-mode ambiguity, synchronous send, and excluded command behavior remain intact.

## Integration Tests

- [x] Fake provider create invokes only version/help and creates no session.
- [x] First send captures prompt from stdin, mints deterministic UUID, and persists binding before completion.
- [x] Second send receives the identical UUID in explicit resume argv.
- [ ] Concurrent send, stale lock recovery, canonical cwd, first-run pre/post-bind failure, and session mismatch behave safely.
- [x] Claude print and interactive Codex regression suites remain green.

## End-to-End Tests

- [x] Service/CLI-boundary fake-Codex create → first send → second resumed send.
- [x] JSON/human output has correct provider/mode and no fake PID, prompt, raw stderr secret, or invented session.
- [ ] Unsupported provider/mode and ambiguous targets exit with actionable errors.

## Test Data

`fake-codex.cjs` supports version/help, initial/resume syntax, deterministic UUID, stdin/argv/cwd capture, chunked and multiple events, delay/concurrency, secret stderr, non-zero exit, malformed/oversized/truncated streams, missing required events, mismatch, and pre/post-binding failures. Tests use temporary store/cwd paths and deterministic process/clock injections.

## Test Reporting & Coverage

- Focused: package Vitest paths for each red/green/refactor cycle.
- Coverage: agent-manager and CLI coverage commands, with file-level review of all new modules.
- Gates: lifecycle lint, ESLint, TypeScript, builds, package tests, and root full suite.
- Exact exit codes/counts and justified exclusions will be recorded after fresh final runs.

## Manual Testing

No real Codex model run is permitted. Human inspection is limited to fake-provider CLI output and reviewed argv/state artifacts that contain no prompt secret.

## Performance Testing

- [ ] Oversized output remains bounded.
- [ ] Concurrent lock contention fails promptly.
- [ ] Listing mixed records remains practical without provider processes.

## Bug Tracking

Blocking findings are added to planning and fixed through a new red/green/refactor cycle before publication.
