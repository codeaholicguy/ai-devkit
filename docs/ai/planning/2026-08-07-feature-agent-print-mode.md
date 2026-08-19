---
phase: planning
title: Claude Print-Mode Agent Implementation Plan
description: Ordered TDD tasks for durable Claude durable agents
---

# Claude Print-Mode Agent Implementation Plan

## Milestones

- [x] Milestone 1: Durable identity, safe storage, and locking foundation.
- [x] Milestone 2: Claude capability validation and synchronous provider execution.
- [x] Milestone 3: CLI start/list/detail/send integration with interactive compatibility.
- [ ] Milestone 4: Offline end-to-end validation, security hardening, and documentation.

## Task Breakdown

Every production behavior follows strict red → green → refactor. After each task, run its focused tests and reconcile this checklist before beginning the next task.

### Phase 1: Durable foundation

- [x] Task 1.1: Add durable-agent domain types and typed errors.
  - Outcome: stable record/state/result/process-identity contracts exported from `agent-manager`.
  - Dependencies: approved requirements/design.
  - Validation: type-level/unit tests for valid public shapes and error classification.
  - Scenarios: store, locking, list/detail contract foundations.

- [x] Task 1.2: Implement atomic JSON persistence and safe create/list/resolve.
  - Outcome: separate versioned `durable-agents.json`, canonical cwd, UUID creation, case-insensitive unique names, atomic replacement, and symlink rejection.
  - Dependencies: Task 1.1.
  - Validation: focused store tests including malformed storage, permissions, contention, and unsafe paths.
  - Scenarios: print store/resolution unit tests and create/list integration.

- [x] Task 1.3: Implement per-agent run locking and reconciliation.
  - Outcome: atomic fail-fast busy acquisition, token-checked completion, PID/start fingerprinting, provider identity persistence, and safe abandoned-state recovery.
  - Dependencies: Task 1.2.
  - Validation: concurrent store instances, PID reuse, live provider, incomplete lock, stale recovery, and late-finisher tests.
  - Scenarios: all busy-locking/recovery tests.

### Phase 2: Claude execution

- [x] Task 2.1: Implement non-billable Claude CLI capability probe.
  - Outcome: injectable `--version`/`--help` validation for required flags only.
  - Dependencies: Task 1.1.
  - Validation: focused probe tests; no prompt/provider call.
  - Scenarios: capability probe tests.

- [x] Task 2.2: Implement bounded Claude stream parser and safe runner.
  - Outcome: exact initial/resume argv, stdin prompt handshake, canonical cwd, bounded NDJSON/stderr, session verification, and terminal-result/exit validation.
  - Dependencies: Tasks 1.1 and 1.3.
  - Validation: fake spawn/executable tests for all normal and malformed stream cases.
  - Scenarios: all runner/parser tests and provider identity mismatch integration.

- [x] Task 2.3: Implement durable-agent create/send orchestration.
  - Outcome: start validates then persists without spawn; send acquires, runs once, completes ready or records degraded, and never retries.
  - Dependencies: Tasks 1.2, 1.3, 2.1, and 2.2.
  - Validation: service-level first-send, resume, busy, failure, and recovery tests.
  - Scenarios: print service tests.

### Phase 3: CLI integration

- [x] Task 3.1: Add print mode to `agent start` without changing interactive defaults.
  - Outcome: `--mode interactive|print`, Claude-only validation, correct output, and existing tmux path unchanged.
  - Dependencies: Task 2.3.
  - Validation: command tests for omitted/interactive/print/invalid combinations.
  - Scenarios: CLI start tests.

- [x] Task 3.2: Add combined print/live list and detail presentation.
  - Outcome: durable agents remain visible without PIDs and expose required human/JSON metadata.
  - Dependencies: Task 2.3.
  - Validation: list/detail command tests, ambiguity fixtures, no fake terminal fields.
  - Scenarios: CLI list/detail and create/list/detail integration.

- [x] Task 3.3: Add combined direct-send resolution and synchronous print output.
  - Outcome: exact stable ID/unique name resolution, cross-mode ambiguity, print send execution, and documented wait/timeout/JSON behavior.
  - Dependencies: Tasks 3.1 and 3.2.
  - Validation: direct-send command/service tests plus existing interactive send regression tests.
  - Scenarios: all CLI send tests.

- [x] Task 3.4: Prove excluded integrations remain unchanged.
  - Outcome: groups, open, rename, kill, channels, and TUI retain live-agent behavior.
  - Dependencies: Task 3.3.
  - Validation: focused existing tests and diff inspection show no print routing in excluded paths.
  - Scenarios: adjacent regression checklist.

### Phase 4: Validation and hardening

- [x] Task 4.1: Add fake-provider end-to-end fixture and CLI journey.
  - Outcome: offline start → first send → resume → busy validation through built CLI/service boundary.
  - Dependencies: Phase 3.
  - Validation: deterministic E2E output and invocation/stdin capture.
  - Scenarios: all end-to-end tests.

- [x] Task 4.2: Complete coverage and edge-case hardening.
  - Outcome: new code reaches target coverage; uncovered error/path/parser branches receive TDD tests and fixes.
  - Dependencies: Task 4.1.
  - Validation: agent-manager/CLI coverage reports plus performance/limit tests.
  - Scenarios: coverage and performance sections.

- [x] Task 4.3: Update implementation/testing/user documentation.
  - Outcome: implementation record, completed testing evidence, CLI/package docs, permission/side-effect warnings, and compatibility notes.
  - Dependencies: verified behavior.
  - Validation: base/feature docs lint and documentation review.

- [x] Task 4.4: Run implementation check, formal security review, and holistic code review; fix all blocking findings via TDD.
  - Outcome: design alignment, security coverage, review readiness, and known-risk record.
  - Dependencies: Tasks 4.1–4.3.
  - Validation: lifecycle Phase 7, Phase 8, security-review, Phase 9, and fresh verification commands.

- [ ] Task 4.5: Commit, fetch/rebase latest `origin/main`, revalidate, push, and open PR.
  - Outcome: conventional local commit, clean rebased branch, published PR against main.
  - Dependencies: Task 4.4 and user publication approval.
  - Validation: clean status, commit SHA, post-rebase full validation, remote branch, and PR URL.

## Dependencies

- Tasks are sequential because storage contracts underpin runner/service/CLI behavior.
- Task 2.1 can technically run beside storage work but remains sequential to preserve strict lifecycle reconciliation.
- No real Claude credentials, model access, transcript, channel, task database, or daemon is required.
- Official docs and local `claude --help` define required capabilities; unverified drift is handled by the startup capability probe.
- Optional AI DevKit task tracing is unavailable (`npx ai-devkit@latest task list --name agent-print-mode --json` → `unknown command 'task'`).

## Timeline & Estimates

- Foundation: medium effort; locking/path safety is the highest-risk portion.
- Claude execution: medium effort; protocol parsing and spawn handshake require careful fixtures.
- CLI integration: medium effort; compatibility tests dominate.
- Validation/review/publication: medium effort; coverage and rebase may reveal additional work.

No calendar commitment is inferred; work proceeds sequentially through the approved lifecycle.

## Risks & Mitigation

- **Concurrent session corruption:** atomic per-agent lock; fail fast; exact process identities.
- **Parent crash around spawn:** persist provider PID/start before sending prompt through stdin.
- **Unsafe filesystem targets:** `realpath`/`lstat`, exclusive temp creation, same-directory rename, token-checked lock removal.
- **Provider protocol drift:** capability probe, tolerant unknown events, strict required result/session validation.
- **Secret leakage:** stdin prompt, bounded sanitized diagnostics, no prompt/transcript persistence.
- **Permission/tool side effects:** inherit user configuration, add no bypass flags, never auto-retry.
- **Interactive regression:** separate durable type and narrow CLI integration; full relevant regressions.
- **Scope expansion:** excluded commands/integrations are explicitly checked and documented.

## Resources Needed

- Existing agent-manager and CLI packages/tests.
- Local Claude CLI help/version only; no model invocation.
- Official Claude headless/session/permission/hook documentation.
- Temporary filesystem and fake-provider fixtures.
- AI DevKit TDD, verify, testing, security-review, dev-review, commit, and PR skills.

## Progress Summary

Milestones 1–3 and Tasks 4.1–4.3 are complete. TDD hardening added age-bounded incomplete run-lock recovery, abandoned mutation-lock recovery, cwd binding checks, provider stderr non-disclosure, and explicit rejection of unsupported print timeouts. Task 4.4 lifecycle reviews and fresh validation are in progress; no scope blockers were discovered.
