---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones

- [x] Milestone 1: Lifecycle documents capture the approved behavior and test plan.
- [x] Milestone 2: TDD delivers frame logic, isolated animation, and scroll-safe preview integration.
- [ ] Milestone 3: Docs, coverage, workspace gates, review, commits, and PR are complete. (Only publication remains.)

## Task Breakdown
**What specific work needs to be done?**

### Phase 1: Foundation
- [x] Task 1.1: Add failing pure-logic tests for Unicode/ASCII frame selection and cycling; validate with focused Vitest runs.
- [x] Task 1.2: Add failing Ink tests for 160 ms cycling and cleanup; validate timer lifecycle with fake timers.

### Phase 2: Core Features
- [x] Task 2.1: Implement the isolated leaf and minimum frame logic required by the failing tests.
- [x] Task 2.2: Add failing preview integration tests for RUNNING-only visibility and reclaimed height, then wire the leaf into `PreviewPane`.
- [x] Task 2.3: Add regressions for parent render isolation, Markdown layout stability, scroll clamping, and timer cleanup across status changes.

### Phase 3: Integration & Polish
- [x] Task 3.1: Update agent-console documentation, changelog, implementation notes, and test evidence.
- [x] Task 3.2: Run `npm ci`, `npm run build`, coverage, full workspace tests, lint, typecheck, lifecycle lint, and final review preparation.
- [ ] Task 3.3: Create scoped conventional commits, rebase on `origin/main`, push, and open the requested PR.

## Dependencies
**What needs to happen in what order?**

- Tests precede production code. Integration follows pure frame and leaf behavior.
- No new external dependencies or coordination are required.
- Optional task tracing is unavailable because this CLI build has no `task` command.

## Timeline & Estimates
**When will things be done?**

- Complete sequentially in this lifecycle run; no calendar estimate is needed.

## Risks & Mitigation
**What could go wrong?**

- Ink fake timers may require explicit render flushing; follow existing `PassThrough`, `waitUntilRenderFlush`, rerender, and unmount patterns.
- Status-driven height changes could affect offsets; keep chrome outside preview rows and assert positive-offset stability.
- Environment variables can leak between tests; save and restore `TERM` in test teardown.

## Resources Needed
**What do we need to succeed?**

- One implementation agent, existing Vitest/Ink tooling, approved exploration, repository docs templates, and GitHub CLI.

## Progress Summary

Requirements, design, implementation, testing, documentation, validation, review, and conventional commit creation are complete. No scope changes or blockers were discovered. Remaining work is rebase, push, and PR creation.
