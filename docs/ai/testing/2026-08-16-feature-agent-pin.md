---
phase: testing
title: Agent Pinning Testing Strategy
description: Coverage and regression strategy for SQLite-backed console pins
---

# Agent Pinning Testing Strategy

## Test Coverage Goals

- 100% statement, branch, function, and line coverage for new pure logic such as `partitionPinned`, marker/divider helpers, and the new routing branch.
- Integration coverage for registry migration/mutation/preservation and manager propagation/error behavior.
- Full workspace test, typecheck, lint, and build suites green.

## Unit Tests

### Console ordering and rendering

- [ ] Zero pins preserve input order and produce no `OTHERS` boundary.
- [ ] All pins sort by `lastActive` descending and produce no `OTHERS` boundary.
- [ ] Mixed pins put the pinned block first by recency, preserve unpinned input order, and mark exactly one boundary.
- [ ] Marker variants, including selected+pinned, fit `MARKER_W = 2` with no row-width shift.
- [ ] Pinned and remote channel markers render concurrently.
- [ ] Initial selection chooses the first pinned agent and falls back to the first input agent.
- [ ] Header count and continuous scroll indicators remain unchanged.

### Key routing

- [ ] Lowercase `p` in list focus resolves to `toggle-pin`.
- [ ] Uppercase `P` remains unused.
- [ ] Detail-focus `p` remains a no-op and input-focus `p` remains text.
- [ ] List-mode key hints include `p pin` without changing other mode hints.

## Integration Tests

- [x] Migration 002 adds a default-zero, non-null `pinned` column and is packaged in build output.
- [x] Toggle flips the value and advances `updated_at`.
- [x] Toggle followed by poll/upsert refresh remains pinned; SQL conflict update never writes `pinned`.
- [x] Toggle followed by rename remains pinned.
- [x] Dead-agent prune deletes the row and therefore its pin.
- [x] Toggle of a missing/dead agent reports a clear error rather than silently succeeding.
- [x] Toggle through a readonly database handle reports a clear readonly error.
- [x] `listAgents()` exposes the stored pin and `AgentManager.togglePin` resolves name to `(type, pid)`.
- [ ] Existing duplicate-name, PID-conflict, and register-batch behavior remains intact.

## End-to-End Tests

- [ ] In a console with mixed agents, `p` moves the selected agent to the pinned block after refresh and a second `p` returns it to normal status order.
- [ ] Rename, channel marker, navigation, selection, and scrolling continue to work across partition changes.
- [ ] A disappearing selected process produces a transient actionable error.

## Test Data

- Existing temporary-directory SQLite registry fixtures with deterministic clocks.
- Agent fixtures spanning pinned state, equal/different `lastActive`, status ordering, remote channels, and dead PIDs.
- Readonly connection fixture created only after schema/data setup.

## Test Reporting & Coverage

- Run focused Vitest suites while developing.
- Run package/workspace coverage commands and inspect changed-file coverage for new pure logic.
- Run the repository's full validation scripts identified from package manifests.
- Record fresh commands and results in the implementation/testing docs.

## Manual Testing

- Verify marker alignment and `OTHERS` divider at narrow and normal terminal widths.
- Verify repeated pin/unpin, startup selection, and live refresh behavior in the console.
- Confirm detail/input focus semantics and remote marker coexistence.

## Performance Testing

- Confirm toggling remains a single indexed-row update and partitioning remains `O(n log n)` only for the pinned subset.
- No dedicated load test is required for the small live-agent list.

## Bug Tracking

- Treat pin loss on refresh, row-height/width shifts, silent stale-agent toggles, and migration packaging failures as release blockers.
- Add a regression test with every fixed defect before phase completion.
