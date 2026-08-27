---
phase: planning
title: Pi Print Mode Plan
description: TDD implementation plan for durable Pi print agents
---

# Pi Print Mode Plan

## Milestones

- [x] Requirements and Pi CLI investigation
- [x] Architecture and test strategy
- [x] Provider-aware durable storage
- [x] Pi probe, runner, and service
- [x] CLI integration and lifecycle verification

## Task Breakdown

### Phase 1: Storage Foundation

- [x] T1: Rebase onto the SQLite durable-agent repository and add a failing test for Pi creation/provider validation. No legacy import is required.
- [x] T2: Extend the provider union and repository create input additively while retaining Claude defaults and CAS behavior.

### Phase 2: Pi Provider

- [x] T3: Add failing probe tests for supported, missing, unsupported, and sanitized failure cases; implement `PiCliProbe`. Depends on T2. Evidence: probe suite and coverage. Scenarios: S6-S8.
- [x] T4: Add failing runner tests for first/resume args, stdin, event parsing, identity mismatch, malformed/oversized/incomplete output, process failures, and callbacks; implement `PiPrintRunner`. Depends on T2. Evidence: runner suite and coverage. Scenarios: S9-S18.
- [x] T5: Add failing mocked-service integration tests for create/send success, resume, ambiguity/provider mismatch, binding failure, and state recording; implement `PiPrintAgentService`. Depends on T3-T4. Evidence: service suite. Scenarios: S19-S24.

### Phase 3: CLI Integration

- [x] T6: Add failing CLI tests for Pi print start, provider-aware send/list/detail/console representation, validation, and Claude regression; implement dispatch wiring and exports. Depends on T5. Evidence: CLI targeted suite. Scenarios: S25-S30.
- [x] T7: Update implementation/testing docs, run full relevant tests, coverage, lint, typecheck/build, and lifecycle review. Depends on all tasks. Evidence: fresh command outputs and feature lint.

### Phase 4: Durable Lifecycle Simplification

- [x] T8: Add regressions and correct provider validation/completion sequencing across Pi, Claude, and Codex durable services.
- [x] T9: Extract the shared durable-run lifecycle, move Pi stream state into a provider-local parser, and reuse shared sanitization, UUID, buffering, process, and child-close utilities.
- [x] T10: Consolidate identical success/failure completion construction in the durable-run lifecycle and expand dense Pi provider code for linear readability.

## Dependencies

Storage generalization precedes provider code; runner and probe precede service; service precedes CLI. No new external dependencies. The Codex worktree is read-only reference material, never a branch dependency.

## Risks & Mitigation

- Pi protocol drift: capability probe plus strict protocol tests and explicit errors.
- Store migration regression: version-1 fixtures and full Claude print regression suite.
- Session cross-binding: ownership checks and per-provider uniqueness.
- Sensitive output leakage: stderr drain and bounded sanitized summaries.
- CLI ambiguity: dispatch from persisted provider and preserve existing exact-ID rules.

## Progress Summary

The obsolete file-store generalization commit was dropped during rebase. Pi provider and CLI adaptation now target `DurableAgentRepository`; fresh post-rebase validation is required before completion.
