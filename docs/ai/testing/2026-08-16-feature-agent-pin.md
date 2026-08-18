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

- [x] Zero pins preserve input order and produce no `OTHERS` boundary.
- [x] All pins sort by `lastActive` descending and produce no `OTHERS` boundary.
- [x] Mixed pins put the pinned block first by recency, preserve unpinned input order, and mark exactly one boundary.
- [x] Marker variants, including selected+pinned, fit `MARKER_W = 2` with no row-width shift.
- [x] Pinned and remote channel markers render concurrently.
- [x] Initial selection chooses the first pinned agent and falls back to the first input agent.
- [x] Header count and continuous scroll indicators remain unchanged.

### Key routing

- [x] Lowercase `p` in list focus resolves to `toggle-pin`.
- [x] Uppercase `P` remains unused.
- [x] Detail-focus `p` remains a no-op and input-focus `p` remains text.
- [x] List-mode key hints include `p pin` without changing other mode hints.

## Integration Tests

- [x] Migration 002 adds a default-zero, non-null `pinned` column and is packaged in build output.
- [x] Toggle flips the value and advances `updated_at`.
- [x] Toggle followed by poll/upsert refresh remains pinned; SQL conflict update never writes `pinned`.
- [x] Toggle followed by rename remains pinned.
- [x] Dead-agent prune deletes the row and therefore its pin.
- [x] Toggle of a missing/dead agent reports a clear error rather than silently succeeding.
- [x] Toggle through a readonly database handle reports a clear readonly error.
- [x] `listAgents()` exposes the stored pin and `AgentManager.togglePin` resolves name to `(type, pid)`.
- [x] Existing duplicate-name, PID-conflict, and register-batch behavior remains intact in the full 539-test agent-manager suite.

## End-to-End Tests

- [x] Console integration tests verify `p` toggles the selected agent, refreshes, and repartitions pinned/unpinned ordering.
- [x] Console integration tests cover rename, channel marker, navigation, selection, and scrolling across partition changes.
- [x] Console integration tests verify a disappearing selected process produces a transient actionable error.

## Test Data

- Existing temporary-directory SQLite registry fixtures with deterministic clocks.
- Agent fixtures spanning pinned state, equal/different `lastActive`, status ordering, remote channels, and dead PIDs.
- Readonly connection fixture created only after schema/data setup.

## Test Reporting & Coverage

- Run focused Vitest suites while developing.
- Run package/workspace coverage commands and inspect changed-file coverage for new pure logic.
- Run the repository's full validation scripts identified from package manifests.
- Record fresh commands and results in the implementation/testing docs.

Fresh validation on 2026-08-17:

- `npm test --workspace @ai-devkit/agent-manager`: exit 0; 24 files and 539 tests passed.
- `npm test --workspace ai-devkit`: exit 0; 83 files and 1000 tests passed.
- `npm run test:coverage --workspace @ai-devkit/agent-manager`: exit 0; 89.28% statements, 78.43% branches, 96.03% functions, 92.57% lines.
- `npm run test:coverage --workspace ai-devkit`: exit 0; 74.72% statements, 65.32% branches, 74.39% functions, 75.84% lines. Focused coverage for `agentListLayout.ts` remains 100% in all categories.
- `npm run lint --workspace @ai-devkit/agent-manager` and `npm run typecheck --workspace @ai-devkit/agent-manager`: exit 0.
- `npm run lint --workspace ai-devkit`: exit 0 with five pre-existing warnings and no errors.
- `npm run build --workspace @ai-devkit/agent-manager` and `npm run build --workspace ai-devkit`: exit 0; `cmp` confirmed source and packaged `002_pins.sql` are identical.
- `npm test`, `npm run lint`, and `npm run build`: exit 0 across all six workspace projects; workspace lint reports only existing warnings.
- `npx ai-devkit@latest lint`, `npx ai-devkit@latest lint --feature agent-pin`, and `git diff --check`: exit 0.

## Manual Testing

- [x] Marker alignment and the mixed-only `OTHERS` divider are covered by exact-width rendering/helper assertions at narrow and normal widths.
- [x] Repeated pin/unpin, startup selection, and refresh behavior are covered by console action and selection integration tests.
- [x] Detail/input focus semantics and remote marker coexistence are covered by routing and marker rendering tests.

## Performance Testing

- Confirm toggling remains a single indexed-row update and partitioning remains `O(n log n)` only for the pinned subset.
- No dedicated load test is required for the small live-agent list.

## Bug Tracking

- Treat pin loss on refresh, row-height/width shifts, silent stale-agent toggles, and migration packaging failures as release blockers.
- Add a regression test with every fixed defect before phase completion.
