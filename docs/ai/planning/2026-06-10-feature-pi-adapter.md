---
phase: planning
title: "Pi Adapter Implementation Plan"
feature: pi-adapter
description: Task breakdown for implementing and validating Pi adapter support
---

# Planning: Pi Adapter

## Milestones

- [x] Milestone 1: Requirements, design, testing, and planning docs are complete.
- [x] Milestone 2: Pi adapter behavior is covered by failing tests.
- [x] Milestone 3: Pi adapter implementation passes focused and package tests.

## Task Breakdown

### Phase 1: Docs and Setup
- [x] Task 1.1: Initialize feature worktree and docs.
- [x] Task 1.2: Document requirements, design, testing strategy, and implementation plan.

### Phase 2: Red Tests
- [x] Task 2.1: Add Pi adapter tests for tracker matching and fallback matching.
- [x] Task 2.2: Add Pi parsing, conversation, listSessions, export, and registration tests.

### Phase 3: Implementation
- [x] Task 3.1: Add `pi` to `AgentType`.
- [x] Task 3.2: Implement `PiAdapter`.
- [x] Task 3.3: Export `PiAdapter` and register it in CLI/channel agent-manager wiring.
- [x] Task 3.4: Update README support matrix if present.

### Phase 4: Verification
- [x] Task 4.1: Run focused Pi adapter tests.
- [x] Task 4.2: Run `npx nx run agent-manager:test`.
- [x] Task 4.3: Update implementation/testing docs with evidence.

## Dependencies

- Existing shared utilities: `process`, `session`, `matching`, `AgentRegistry`.
- Optional external extension: `@ai-devkit/pi-session-tracker`; adapter must work without it.
- User-confirmed type string: `pi`.

## Timeline & Estimates

- Docs/setup: small.
- Tests: medium, because process and filesystem setup must mirror existing adapter patterns.
- Implementation: medium, due defensive tracker/schema parsing.
- Verification: small to medium, depending on suite runtime.

## Risks & Mitigation

- Risk: Tracker metadata is malformed or points at a stale file. Mitigation: accept only the documented PID-to-session-path map and fall back safely when entries are unusable.
- Risk: Pi JSONL schema differs from parser assumptions. Mitigation: parse common message fields permissively and never throw on unknown lines.
- Risk: Process command detection is too broad. Mitigation: match executable/script path tokens rather than arbitrary prose when possible.
- Risk: Real Pi is unavailable for manual verification. Mitigation: automated tests cover filesystem/process behavior; call out manual gap.

## Resources Needed

- Local test filesystem via temporary HOME.
- Vitest mocking for process utilities.
- Existing adapter tests as implementation examples.
