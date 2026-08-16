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

- [ ] `/` opens editing only in list focus with no active filter.
- [ ] While editing, `j/k/v/i/m/q` and `/` are text, not commands; Enter confirms and Esc clears.
- [ ] `/` with a confirmed active filter is a no-op.
- [ ] The full Esc matrix leaves detail, input, and pane behavior unchanged.

### List rendering and selection

- [ ] Correct `(matched/total)`, confirmed indicator, placeholder, and no-match message render.
- [ ] Every visible substring occurrence is bold while clipped names and remote markers retain correct width.
- [ ] Filtered-out selection chooses the first result, no results choose `null`, and clear keeps the current selection.
- [ ] Scroll clamps when a long list narrows and remains valid when it widens; arrows reflect the filtered set.
- [ ] Error plus empty source retains existing error precedence; long query input remains usable.

## Integration Tests

- [ ] Console navigation and preview operate on the filtered ordered array.
- [ ] Polling pauses while editing and while a query is applied.
- [ ] Esc-clear resumes polling with an immediate refresh; filter state survives incidental refreshes.
- [ ] Existing list/detail/input/modal shortcuts regressions pass.
- [ ] Filter composes with any incoming order and has no pin-specific assumptions.

## End-to-End Tests

- [ ] Open `/`, type a mixed-case substring, inspect live results, Enter, navigate, then Esc-clear.
- [ ] Filter to no matches, verify null selection, clear, and verify full list refresh.
- [ ] Type command characters and `/` into the editor without triggering console actions.

## Test Data

Use existing `AgentInfo` fixtures plus names with mixed case, `Ä`, repeated substrings, `/`, long text, remote channel state, and ordered entries that expose accidental sorting.

## Test Reporting & Coverage

- Run package-targeted Vitest commands during TDD.
- Run the CLI test/typecheck/lint commands defined by repository scripts.
- Run focused coverage for the pure filter module and routing; record any unavoidable framework-only gaps explicitly (none expected).

Task 1.1 evidence: `npx vitest run packages/cli/src/__tests__/tui/console/filter/agentFilter.test.ts --coverage --coverage.include=packages/cli/src/tui/console/filter/agentFilter.ts --coverage.reporter=text` passed 5 tests with 100% statements, branches, functions, and lines.

## Manual Testing

- [ ] Inspect narrow and wide terminal rendering, focus styling, input clipping, count/chip wording, and key hints.
- [ ] Confirm keyboard-only behavior and that matching is conveyed by bold text without color alone.

## Performance Testing

No load harness is required. Unit tests verify linear order-preserving behavior; manual smoke testing with a long fixture list checks that incremental typing remains immediate.

## Bug Tracking

Any failure maps back to the relevant unchecked scenario and blocks final review until fixed and covered by a regression test.
