---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
**How do we get started?**

- Active worktree: `.worktrees/feature-view-memory-list-in-agent-console`
- Branch: `feature-view-memory-list-in-agent-console`
- Dependencies were installed with `npm ci` in the worktree.
- Local workspace packages needed for full CLI tests:
  - `npm --workspace packages/agent-manager run build`
  - `npm --workspace packages/channel-connector run build`
  - `npm --workspace packages/memory run build`

## Code Structure
**How is the code organized?**

- `packages/cli/src/tui/console/types.ts`
  - Added `ConsoleMemoryItem`, `MemoryListState`, and `memory-list` right-pane mode.
- `packages/cli/src/tui/console/hooks/useMemoryList.ts`
  - New config-aware memory loader and hook.
- `packages/cli/src/tui/console/MemoryListPane.tsx`
  - New read-only Ink pane for recent memory items.
- `packages/cli/src/tui/console/rightPaneMode.ts`
  - Lightweight helper for `M` shortcut mode transitions.
- `packages/cli/src/tui/console/ConsoleApp.tsx`
  - Wires `M` shortcut and replacement-pane rendering.
- `packages/cli/src/tui/console/HelpPane.tsx`
  - Documents `M` in help and footer hints.
- Tests:
  - `packages/cli/src/__tests__/tui/console/hooks/useMemoryList.test.ts`
  - `packages/cli/src/__tests__/tui/console/MemoryListPane.test.ts`
  - `packages/cli/src/__tests__/tui/console/ConsoleApp.memory.test.ts`
  - updated `HelpPane.test.ts`

## Implementation Notes
**Key technical details to remember:**

### Core Features
- Memory loading:
  - `loadMemoryList` resolves `ConfigManager.getMemoryDbPath()` before calling `memoryListCommand`.
  - Requests are bounded with `limit: 20` and ordered by `updated-desc`.
  - The hook ignores late async results after unmount.
- Memory pane:
  - Renders loading, empty, error, and recent-item states.
  - Shows title, scope, tags, and updated date only.
  - Limits rendered rows by pane height and truncates long title/metadata strings.
- Console integration:
  - Uppercase `M` toggles between preview and memory list.
  - Lowercase `m` remains message input.
  - The memory pane follows the existing wide right-pane and narrow replacement-pane model.

### Patterns & Best Practices
- Keep memory data access isolated in `useMemoryList`.
- Keep shortcut mode behavior testable through a pure helper.
- Reuse existing `truncate`, `formatRelative`, `Panel`, `SectionTitle`, and `TUI_COLORS` utilities.
- Do not parse SQLite directly from console UI code.

## Integration Points
**How do pieces connect?**

- `ConsoleApp` renders `MemoryListPane` when `rightPaneMode.type === 'memory-list'`.
- `MemoryListPane` calls `useMemoryList`.
- `useMemoryList` resolves the configured memory database path with `ConfigManager` and reads via `@ai-devkit/memory` `memoryListCommand`.
- No new external API, database schema, or command syntax was added.

## Error Handling
**How do we handle failures?**

- Loader failures are converted to pane-local error text using `getErrorMessage`.
- Errors do not exit the console or stop agent polling.
- Empty databases render `No memory items yet.`
- Late async results after unmount are ignored.

## Performance Considerations
**How do we keep it fast?**

- Memory list loads only when the pane opens.
- No continuous polling was added.
- The read is bounded to 20 items.
- Rendering is bounded by the pane height so rows cannot push into the footer/input area.

## Security Notes
**What security measures are in place?**

- The feature is read-only.
- Memory content is not logged.
- The pane displays only title and metadata, not full memory content.
- The console uses the same local memory access available to the CLI user.

## Verification Evidence

- `npm --workspace packages/cli test -- src/__tests__/tui/console/hooks/useMemoryList.test.ts src/__tests__/tui/console/MemoryListPane.test.ts src/__tests__/tui/console/HelpPane.test.ts src/__tests__/tui/console/ConsoleApp.memory.test.ts`
  - Exit 0; 4 files, 16 tests passed.
- `npm --workspace packages/cli run build`
  - Exit 0; CLI package compiled 187 files and emitted declarations.
- `npm --workspace packages/cli test`
  - First run failed because local workspace dependencies had unbuilt `dist` entries for `@ai-devkit/agent-manager` and `@ai-devkit/channel-connector`.
  - After building `packages/agent-manager`, `packages/channel-connector`, and `packages/memory`, rerun exited 0; 75 files, 880 tests passed.
  - Final testing-phase run exited 0; 77 files, 888 tests passed.
- `npm --workspace packages/cli run test:coverage`
  - First run failed at branch coverage 59.61%, below the 60% global threshold.
  - Final run exited 0 after adding focused branch tests; 77 files, 888 tests passed; branch coverage 60.09%.
