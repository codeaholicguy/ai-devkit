---
phase: testing
title: Agent Name Filter Testing Strategy
description: Coverage and interaction tests for console agent filtering
---

# Agent Name Filter Testing Strategy

## Test Coverage Goals

- 100% statements, branches, functions, and lines for the three pure filter functions and new routing branches.
- Targeted component/hook integration coverage for selection, scroll, rendering, and polling.
- Full CLI regression suite before review.

## Unit Tests

### Pure filter logic

- [x] Empty query matches all and `filterAgents` returns the input array by identity.
- [x] Matching is case-insensitive substring-only, order-preserving, and supports basic `toLowerCase()` Unicode folding.
- [x] Positions cover no match, empty query, one occurrence, and multiple non-overlapping occurrences.
- [x] No fuzzy/subsequence behavior or ranking occurs.

### Routing and state transitions

- [x] `/` opens editing only in list focus with no active filter.
- [x] While editing, `j/k/v/i/m/q` and `/` are text, not commands; Enter confirms and Esc clears.
- [x] `/` with a confirmed active filter is a no-op.
- [x] Router-level Esc matrix leaves detail/input behavior unchanged and clears only an active list filter; full shell/pane integration remains in Task 2.1.

### List rendering and selection

- [x] Correct `(matched/total)`, confirmed indicator, placeholder, and no-match message render.
- [x] Every visible substring occurrence is bold while clipped names and remote markers retain correct width.
- [x] Filtered-out selection chooses the first result, no results choose `null`, and clear keeps the current selection.
- [x] Scroll clamps when a long list narrows and remains valid when it widens; arrows reflect the filtered set.
- [x] Error plus empty source retains existing error precedence; long query input remains usable.

## Integration Tests

- [x] Console navigation and preview operate on the filtered ordered array.
- [x] Polling pauses while editing and while a query is applied.
- [x] Esc-clear resumes polling with an immediate refresh; filter state survives incidental refreshes.
- [x] Existing list/detail/input/modal shortcuts regressions pass.
- [x] Filter composes with any incoming order and has no pin-specific assumptions.

## End-to-End Tests

- [x] Open `/`, type a mixed-case substring, inspect live results, Enter, navigate, then Esc-clear.
- [x] Filter to no matches, verify null selection, clear, and verify full list refresh.
- [x] Type command characters and `/` into the editor without triggering console actions.

## Test Data

Use existing `AgentInfo` fixtures plus names with mixed case, `Ä`, repeated substrings, `/`, long text, remote channel state, and ordered entries that expose accidental sorting.

## Test Reporting & Coverage

- Run package-targeted Vitest commands during TDD.
- Run the CLI test/typecheck/lint commands defined by repository scripts.
- Run focused coverage for the pure filter module and routing; record any unavoidable framework-only gaps explicitly (none expected).

Task 1.1 evidence: `npx vitest run packages/cli/src/__tests__/tui/console/filter/agentFilter.test.ts --coverage --coverage.include=packages/cli/src/tui/console/filter/agentFilter.ts --coverage.reporter=text` passed 5 tests with 100% statements, branches, functions, and lines.

Task 1.2 evidence: focused routing coverage passed 10 tests with 100% statements, branches, functions, and lines for `consoleKeyRouting.ts`.

Task 2 evidence: the focused console suite passed 35 tests across matcher, routing, shell helpers, provider polling, list rendering, and help/footer hints. `ConsoleContext.test.ts` verifies that both subscriptions stop during the generalized text-entry/filter signal and refresh immediately when it clears.

Task 3 evidence: the full CLI suite passed 83 files and 1001 tests; CLI lint exited 0 with five pre-existing warnings; CLI build completed SWC compilation and TypeScript declaration generation; feature lint passed every configured document and worktree check.

## Manual Testing

- [x] Inspect narrow and wide terminal rendering, focus styling, input clipping, count/chip wording, and key hints through deterministic Ink render tests and layout/segment helpers.
- [x] Confirm keyboard-only behavior and that matching is conveyed by bold text without color alone through routing and highlighted-segment assertions.

## Performance Testing

No load harness is required. Unit tests verify linear order-preserving behavior; manual smoke testing with a long fixture list checks that incremental typing remains immediate.

## Bug Tracking

Any failure maps back to the relevant unchecked scenario and blocks final review until fixed and covered by a regression test.
