---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones
**What are the major checkpoints?**

- [x] Milestone 1: Memory loading foundation
  - Outcome: console code has a typed memory-list mode and a config-aware loader that reads bounded recent memory items through `@ai-devkit/memory`.
- [x] Milestone 2: Console UI integration
  - Outcome: `M` opens/closes a read-only memory list pane in wide and narrow layouts without disrupting existing console workflows.
- [x] Milestone 3: Test coverage and verification
  - Outcome: targeted console tests cover the new pane, hook, shortcut, empty/error states, and help/footer hints; lifecycle lint and package tests pass.

## Task Breakdown
**What specific work needs to be done?**

### Phase 1: Memory Loading Foundation
- [x] Task 1.1: Add memory-list state types
  - Outcome: `packages/cli/src/tui/console/types.ts` includes `RightPaneMode` support for `{ type: 'memory-list' }` and any shared memory item state types needed by the pane/hook.
  - Dependencies: approved design data model.
  - Validation evidence: TypeScript compile or targeted CLI test run.
  - Testing scenarios: Console shortcut/right-pane mode tests.
- [x] Task 1.2: Implement `useMemoryList`
  - Outcome: `packages/cli/src/tui/console/hooks/useMemoryList.ts` resolves `ConfigManager.getMemoryDbPath()`, calls `memoryListCommand({ limit: 20, sort: 'updated-desc', dbPath })`, maps `KnowledgeItem` to console row state, and ignores late results after unmount.
  - Dependencies: Task 1.1.
  - Validation evidence: unit tests for success, empty results, thrown errors, configured path resolution, and late-result behavior.
  - Testing scenarios: `useMemoryList` unit tests; memory loader integration path.

### Phase 2: Console UI Integration
- [x] Task 2.1: Add `MemoryListPane`
  - Outcome: new Ink pane renders loading, empty, error, and recent item rows with title, scope, tags, and updated time while respecting width/height constraints.
  - Dependencies: Tasks 1.1 and 1.2.
  - Validation evidence: component tests for loading/empty/error/items/long text.
  - Testing scenarios: `MemoryListPane` unit tests; text fit and bounded row behavior.
- [x] Task 2.2: Wire the pane into `ConsoleApp`
  - Outcome: uppercase `M` toggles memory-list mode from global shortcut focus; `M` does not interfere with chat input, start, rename, channel select, help, or kill confirmation behavior. Wide layout renders in the right pane; narrow layout uses replacement-pane behavior.
  - Dependencies: Task 2.1.
  - Validation evidence: shortcut/mode tests or focused tests around exported helper behavior where full Ink input integration is not practical.
  - Testing scenarios: `M` open/close, ignored while input or modal owns keyboard, wide/narrow rendering.
- [x] Task 2.3: Update console help and footer hints
  - Outcome: `HelpPane` documents `M` and `StatusFooter` includes compact `M memory` hint without removing important existing shortcuts.
  - Dependencies: Task 2.2.
  - Validation evidence: `HelpPane` helper tests and snapshot/string assertions for hints.
  - Testing scenarios: help/footer hint tests and shortcut regression coverage.

### Phase 3: Verification and Documentation
- [x] Task 3.1: Add/adjust automated tests
  - Outcome: tests cover all new hook, pane, shortcut, and hint behavior listed in the testing strategy.
  - Dependencies: Tasks 1.1 through 2.3.
  - Validation evidence: `npm --workspace packages/cli test -- --runInBand` if supported, otherwise `npm --workspace packages/cli test`; targeted Vitest paths if full package test is too slow.
  - Testing scenarios: all unit and integration scenarios from the testing doc.
- [x] Task 3.2: Run broader validation
  - Outcome: lifecycle lint, CLI tests, and build/type checks pass for the changed package.
  - Dependencies: Task 3.1.
  - Validation evidence:
    - `npx ai-devkit@latest lint --feature view-memory-list-in-agent-console`
    - `npm --workspace packages/cli test`
    - `npm --workspace packages/cli run build`
  - Testing scenarios: regression of adjacent console features and type safety.
- [x] Task 3.3: Update implementation/testing docs with evidence
  - Outcome: implementation doc records changed files, key decisions, verification commands, and any deferred follow-ups. Testing doc checkboxes are updated after tests exist.
  - Dependencies: Task 3.2.
  - Validation evidence: feature lint after doc updates.
  - Testing scenarios: documentation traceability.

## Dependencies
**What needs to happen in what order?**

- Task 1.1 must land before tasks that reference `memory-list` mode.
- Task 1.2 must land before UI renders live memory data.
- Task 2.1 can be developed with mocked memory state, but final integration depends on Task 1.2.
- Task 2.2 depends on `MemoryListPane` and existing `ConsoleApp` right-pane replacement behavior.
- Task 2.3 depends on the final shortcut choice remaining `M`.
- Task 3.1 and Task 3.2 depend on implementation tasks being complete.
- No external network service is required; the feature reads local SQLite memory through existing package APIs.

## Timeline & Estimates
**When will things be done?**

- Estimated effort:
  - Memory loading foundation: small to medium.
  - Console UI integration: medium, mostly around keyboard and layout regression risk.
  - Test coverage and verification: medium.
- Target sequence:
  - Complete Task 1.1 and Task 1.2 first.
  - Complete Task 2.1 through Task 2.3 in one implementation pass.
  - Complete tests and docs before implementation check/testing phases.
- Buffer:
  - Reserve time for Ink test limitations; helper extraction may be needed if direct keyboard simulation is brittle.

## Risks & Mitigation
**What could go wrong?**

- Risk: Importing `memoryListCommand` into TUI code could make tests harder because it opens SQLite.
  - Mitigation: keep loading isolated in `useMemoryList` and mock the memory API in hook tests.
- Risk: async load results could update state after the pane is closed.
  - Mitigation: track active/cancelled state inside the hook and ignore late results.
- Risk: long memory metadata could break terminal layout.
  - Mitigation: use existing truncation utilities and height-based row budgets.
- Risk: `M` shortcut could conflict with existing input flows.
  - Mitigation: route only in global shortcut handling and add regression tests for input/modal states.
- Risk: full Ink keyboard integration tests may be brittle.
  - Mitigation: test pure helpers, hook behavior, pane rendering, and mode routing as close to the existing test style as possible.

## Resources Needed
**What do we need to succeed?**

- Existing code:
  - `packages/cli/src/tui/console/ConsoleApp.tsx`
  - `packages/cli/src/tui/console/types.ts`
  - `packages/cli/src/tui/console/HelpPane.tsx`
  - `packages/cli/src/tui/console/StatusFooter.tsx`
  - `packages/cli/src/lib/Config.ts`
  - `packages/memory/src/api.ts`
- New likely files:
  - `packages/cli/src/tui/console/MemoryListPane.tsx`
  - `packages/cli/src/tui/console/hooks/useMemoryList.ts`
  - corresponding tests under `packages/cli/src/__tests__/tui/console`.
- Commands:
  - `npx ai-devkit@latest lint --feature view-memory-list-in-agent-console`
  - `npm --workspace packages/cli test`
  - `npm --workspace packages/cli run build`

## Progress Summary

All planned implementation tasks are complete. The implementation added the read-only memory list pane, config-aware loader, shortcut wiring, help/footer hints, and focused tests. Broader CLI validation passed after building local workspace package dependencies that the CLI test suite imports from `dist`.
