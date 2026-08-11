---
phase: planning
title: Codex Print-Mode Agent Implementation Plan
description: Ordered TDD work for durable Codex print agents
---

# Codex Print-Mode Agent Implementation Plan

## Milestones

- [ ] Milestone 1: Provider-aware durable model, migration, and session binding.
- [ ] Milestone 2: Codex probe, runner, service, and deterministic fixture.
- [ ] Milestone 3: CLI integration and compatibility coverage.
- [ ] Milestone 4: Documentation, full validation, review, and PR publication.

## Task Breakdown

### Phase 1: Foundation

- [ ] Task 1.1: Drive the discriminated `PrintAgent` union and provider-aware creation with failing store/domain tests.
  - Outcome: Claude and Codex records coexist; legacy Claude files remain valid.
  - Validation: focused `PrintAgent`/`PrintAgentStore` tests and typecheck.
- [ ] Task 1.2: Drive `bindProviderSession` integrity behavior with failing tests.
  - Outcome: token-owned atomic null-to-UUID binding, idempotence, mismatch and duplicate rejection.
  - Dependencies: Task 1.1.
  - Validation: focused store tests for every binding branch and persistence after failure.

### Phase 2: Codex execution

- [x] Task 2.1: Drive `CodexCliProbe` and provider error types with failing tests.
  - Outcome: version/help-only capability validation and sanitized errors.
- [x] Task 2.2: Drive `CodexPrintRunner` with fake spawn/fixture tests.
  - Outcome: exact argv/cwd/stdin handshake; bounded strict JSONL; immediate UUID binding; ordered assistant output.
  - Validation: normal, chunked, unknown, malformed, oversized, truncated, missing, mismatch, stderr, and exit branches.
- [x] Task 2.3: Drive `CodexPrintAgentService` orchestration with failing tests.
  - Outcome: first/resume lifecycle, correct health degradation, no retry, binding retained after later failure.

### Phase 3: CLI and integration

- [ ] Task 3.1: Add provider-aware exports and fake-Codex integration journey.
  - Outcome: create performs probes only; first send binds; second send resumes same UUID; concurrency/recovery/cwd work offline.
- [ ] Task 3.2: Drive CLI start/list/detail/send behavior with failing command tests.
  - Outcome: `--type codex --mode print`, `Codex (print)`, `not started`, record-derived JSON provider, provider-selected send.
- [ ] Task 3.3: Run Claude-print and interactive-Codex regression tests and inspect excluded command paths.

### Phase 4: Validation and publication

- [ ] Task 4.1: Reconcile implementation/testing docs and reach 100% coverage on new pure logic.
- [ ] Task 4.2: Run feature/base lifecycle lint, lint, typecheck, build, package/full tests, and coverage.
- [ ] Task 4.3: Perform design-alignment and holistic code review; fix blocking findings via TDD.
- [ ] Task 4.4: Create conventional commits, fetch/rebase `origin/main`, rerun gates, push, and open the requested PR.

## Dependencies

Tasks are ordered because the domain/store contract underpins runner/service and CLI behavior. Tests use only injected process boundaries and `fake-codex.cjs`; no model credentials or calls are required. Optional task tracing is unavailable (`npx ai-devkit@latest task list --name codex-print-mode --json` returned `unknown command 'task'`).

## Timeline & Estimates

- Foundation: medium; migration and binding integrity are highest risk.
- Provider execution: medium/high; protocol and crash ordering dominate.
- CLI/integration: medium; compatibility tests dominate.
- Validation/publication: medium; coverage and rebase can reveal follow-up fixes.

Work proceeds sequentially through the approved lifecycle without a calendar commitment.

## Risks & Mitigation

- Orphan/forked sessions: bind on `thread.started`; never recover through `--last`.
- Concurrent resume: reuse fail-fast per-agent locks and token ownership.
- Protocol drift: capability probe, strict required events, tolerant unknown objects.
- Secret leakage: stdin-only prompt, bounded/sanitized diagnostics, no transcript storage.
- Regression: parallel provider modules plus focused and full existing suites.
- Scope growth: deletion, Pi, capacity routing, server mode, and generic adapters remain deferred.

## Resources Needed

- Existing Claude print implementation/tests/docs as the template.
- Codex 0.147.0 empirical event contract supplied in the build brief.
- Node/Nx/Vitest toolchain and temporary fake-provider files.
