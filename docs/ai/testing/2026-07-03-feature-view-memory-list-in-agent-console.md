---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- Unit test coverage target: 100% of new console memory-list components and hooks where practical.
- Integration scope: console keyboard routing, pane mode rendering, config-aware memory loading, and adjacent shortcut regressions.
- End-to-end scope: manual TUI smoke test for opening/closing the memory list inside `ai-devkit agent console`.
- Acceptance criteria alignment: every requirements success criterion should map to at least one automated or manual validation item below.

## Unit Tests
**What individual components need testing?**

### `MemoryListPane`
- [x] Renders loading state without layout-breaking text.
- [x] Renders empty state when the memory list has no items.
- [x] Renders item title, scope, tags, and relative updated time for recent memory items.
- [x] Truncates or wraps long title/scope/tag values so they fit within the pane.
- [x] Renders an error state without throwing.

### `useMemoryList`
- [x] Calls `ConfigManager.getMemoryDbPath()` before loading memory.
- [x] Calls `memoryListCommand` with a bounded limit and `updated-desc` sort.
- [x] Maps `KnowledgeItem` values to console row state.
- [x] Handles missing/empty databases as an empty list.
- [x] Converts thrown errors to hook error state and keeps previous UI stable.

### Console Shortcut and Help
- [x] `M` opens the memory-list pane from list/preview focus.
- [x] `M` toggles back to preview when memory list is already open, or otherwise provides a documented back path.
- [x] `M` is ignored while chat input, start agent, rename, channel select, or kill confirmation owns input.
- [x] `HelpPane` includes the memory shortcut.
- [x] `StatusFooter` includes a compact memory hint without overflowing common widths.

## Integration Tests
**How do we test component interactions?**

- [x] Console renders memory list in the right pane on wide terminals.
- [x] Console renders memory list as the replacement pane on narrow terminals.
- [x] Existing shortcuts still work: `j/k`, `s`, `r`, `c`, `C`, `o`, `i/m`, `K`, `h`, `q`.
- [x] Memory loader uses the same configured database path as `ai-devkit memory` commands.
- [x] Memory load failure is isolated to the pane and does not stop agent polling.

## End-to-End Tests
**What user flows need validation?**

- [ ] Start `ai-devkit agent console`, press `M`, and verify recent memory items are visible.
- [ ] Press the documented return/toggle key and verify preview/chat input behavior returns.
- [ ] Run with an empty memory database and verify the empty state.
- [ ] Run with a deliberately invalid configured memory path and verify the error state.
- [ ] Regression smoke: send a message to a selected agent after opening/closing memory list.

## Test Data
**What data do we use for testing?**

- Mock `memoryListCommand` results for component/hook tests.
- Use fixtures with:
  - zero memory items
  - one short memory item
  - multiple items with tags and different scopes
  - long titles/tags/scopes
  - thrown loader error
- For manual validation, create temporary memory items through `ai-devkit memory store` in a disposable configured database path.

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Run targeted tests for console TUI and memory command areas.
- Run broader package tests before implementation is considered complete.
- Record any coverage gaps with rationale in the implementation doc.
- Capture manual TUI smoke results in the implementation/testing docs.

Current automated evidence:
- `npm --workspace packages/cli test -- src/__tests__/tui/console/hooks/useMemoryList.test.ts src/__tests__/tui/console/MemoryListPane.test.ts src/__tests__/tui/console/HelpPane.test.ts src/__tests__/tui/console/ConsoleApp.memory.test.ts`
  - Exit 0; 4 files, 16 tests passed.
- `npm --workspace packages/cli run build`
  - Exit 0; 187 files compiled.
- `npm --workspace packages/cli test`
  - Exit 0 after building local workspace dependencies; 75 files, 880 tests passed during implementation verification.
  - Final testing-phase run exited 0; 77 files, 888 tests passed.
- `npm --workspace packages/cli run test:coverage`
  - First run failed at branch coverage 59.61%, below the 60% global threshold.
  - Added focused branch tests for memory pane helpers, `getErrorMessage`, `deepEqual`, and console status display.
  - Final run exited 0; 77 files, 888 tests passed; branch coverage 60.09%.

## Manual Testing
**What requires human validation?**

- Verify keyboard-only operation.
- Verify text remains readable on wide and narrow terminals.
- Verify the pane does not overlap footer, header, list, preview, or chat input.
- Verify memory content is not logged to the terminal outside the intended pane.

Manual TUI smoke status:
- Not executed in this non-interactive testing pass. The automated tests cover mode routing, row bounds, error/empty states, and shortcut hints, but a human terminal smoke check is still recommended before release.

## Performance Testing
**How do we validate performance?**

- Seed more than the default result limit and verify only bounded rows render.
- Confirm opening the memory list does not visibly freeze agent list updates.
- Confirm repeated open/close cycles do not accumulate timers or duplicate loads unexpectedly.

## Bug Tracking
**How do we manage issues?**

- Track defects against this feature task or follow-up tickets.
- Treat crashes, memory data leakage, or broken existing console shortcuts as blocking.
- Treat search, pagination, and mutation requests as follow-up scope unless they block the read-only list.
