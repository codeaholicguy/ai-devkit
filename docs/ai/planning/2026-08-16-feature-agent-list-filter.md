---
phase: planning
title: Agent Name Filter Implementation Plan
description: Ordered TDD tasks for inline console name filtering
---

# Agent Name Filter Implementation Plan

## Milestones

- [x] Milestone 1: Pure substring semantics and key-state transitions are test-driven and complete.
- [x] Milestone 2: Console state, polling, navigation, and list rendering integrate over one ordered filtered array.
- [x] Milestone 3: Edge-case coverage, docs, lint, full tests, and review are complete.

## Task Breakdown

### Phase 1: Foundation

- [x] Task 1.1 — Pure filter logic (TDD)
  - Outcome: add `matchAgentByName`, `findMatchPositions`, and `filterAgents` with substring-only semantics, basic Unicode folding, all-occurrence positions, identity-on-empty, and preserved order.
  - Dependencies: none; no new packages.
  - Evidence: focused failing-then-passing unit tests and 100% module coverage.
  - Scenarios: pure filter logic section of the testing strategy.
- [x] Task 1.2 — Filter key transitions (TDD)
  - Outcome: add filter focus plus router actions for open, clear, active-filter slash no-op, and unchanged Esc/detail/input behavior.
  - Dependencies: Task 1.1 only for shared terminology.
  - Evidence: focused routing tests with 100% new-branch coverage.
  - Scenarios: routing/Esc matrix and printable-command isolation.

### Phase 2: Core Integration

- [x] Task 2.1 — Shell state, selection, navigation, and polling
  - Outcome: parent-owned query, filtered refs, selection fallback/null/clear behavior, filtered j/k navigation, pre-global editing interception, paused poll through editing/confirmed states, and immediate refresh on clear.
  - Dependencies: Tasks 1.1–1.2.
  - Evidence: ConsoleApp/ConsoleContext interaction tests and existing regressions.
  - Scenarios: selection rules, polling lifecycle, active slash no-op, incidental refresh stability, pin-agnostic ordering.
- [x] Task 2.2 — Inline list rendering
  - Outcome: TextInput under title, confirmed chip, `(matched/total)`, no-match state, highlighted clipped substrings, remote marker preservation, and filtered scroll clamp/more indicators.
  - Dependencies: Task 2.1 supplies props and visible order.
  - Evidence: AgentListPane render tests covering width, count, highlight, error precedence, and narrow/widen scroll transitions.
  - Scenarios: list rendering/selection section and long-query/manual accessibility checks.
- [x] Task 2.3 — Footer and help affordances
  - Outcome: `/ filter` appears in list help/footer; active state advertises Esc-clear without leaking editing keystrokes.
  - Dependencies: Task 2.1 filter state.
  - Evidence: HelpPane/StatusFooter tests and snapshots/text assertions.

### Phase 3: Verification & Polish

- [x] Task 3.1 — Reconcile implementation and lifecycle docs
  - Outcome: implementation notes match code; completed plan tasks and test checkboxes carry fresh evidence.
  - Dependencies: all implementation tasks.
  - Evidence: feature lint and reviewed diffs.
- [x] Task 3.2 — Full quality gates
  - Outcome: focused coverage, CLI lint/build/test, repository-appropriate regression suite, and manual rendering smoke checks pass.
  - Dependencies: Task 3.1.
  - Evidence: fresh command output recorded in testing/implementation docs.
- [x] Task 3.3 — Final review and publication
  - Outcome: holistic review finds no blockers; commits are scoped; branch is pushed and PR is merged-ready.
  - Dependencies: Task 3.2.
  - Evidence: clean status, reviewed commit range, PR checks, and feature lint.

## Dependencies

Pure semantics precede shell integration; shell ownership precedes pane/footer wiring; implementation tasks are followed immediately by planning reconciliation. The parallel pin feature is not a code dependency: filtering consumes the received order and adds no pin-specific logic. Optional task tracing is unavailable (`npx ai-devkit@latest task list --name agent-list-filter --json` reports unknown command), so docs and commits provide progress traceability.

## Timeline & Estimates

- Foundation: small, 1–2 focused implementation checkpoints.
- Core integration: medium, 2–3 checkpoints with component/hook tests.
- Verification and review: medium, driven by regressions and coverage findings.
- Target: complete in the current lifecycle session; no date-based rollout or migration is required.

## Risks & Mitigation

- Global shortcuts leak while typing: intercept filter focus before all global handlers and test dangerous printable keys.
- Selection/preview disagree: derive and route through one `visibleAgents` array in the shell.
- Stale scroll after narrowing: clamp offset independently against filtered length and capacity.
- Poll resumes without fresh data: Esc-clear explicitly invokes `refresh` after unpausing.
- Highlight clipping breaks row width: split only the clipped name and include all row chrome/channel columns in width tests.
- Parallel pin assumptions creep in: assert preserved arbitrary input order and reject all sorting/partition code.

## Resources Needed

Existing React/Ink, `ink-text-input`, Vitest, console fixtures, lifecycle docs, and repository scripts only. No new services, dependencies, migrations, or additional agents are required.

## Progress Summary

Tasks 1.1–3.3 and all milestones are complete. The shell owns one substring-filtered ordered array for selection, navigation, preview, and rendering; provider polling pauses throughout editing and confirmed-filter states; list/footer/help rendering and edge cases are covered. Fresh focused coverage is 100% for matcher and routing, 35 focused tests pass, and the full CLI test/lint/build gates pass. Final review found no blockers, the branch was synchronized with `origin/main` without a rebase, and PR #168 was opened for review. No scope changes or blockers were discovered.
