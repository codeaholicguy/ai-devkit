---
phase: implementation
title: Agent Console Detail Chat View - Implementation Guide
description: Implementation notes for focused and scrollable chat content in the interactive agent console
---

# Implementation Guide

## Development Setup

- Active worktree: `.worktrees/feature-agent-console-detail-chat-view`
- Branch: `feature-agent-console-detail-chat-view`
- Dependencies: bootstrapped with `npm ci`
- Feature docs: `docs/ai/*/2026-07-02-feature-agent-console-detail-chat-view.md`

## Code Structure

- `packages/cli/src/tui/console/types.ts`
- `packages/cli/src/tui/console/ConsoleApp.tsx`
- `packages/cli/src/tui/console/PreviewSection.tsx`
- `packages/cli/src/tui/console/PreviewPane.tsx`
- `packages/cli/src/tui/console/consoleKeyRouting.ts`
- `packages/cli/src/__tests__/tui/console/PreviewPane.test.ts`
- `packages/cli/src/__tests__/tui/console/focusRouting.test.ts`
- `packages/cli/src/__tests__/tui/console/HelpPane.test.ts`

## Implementation Notes

### Core Features

- Add `detail` as a third console focus state instead of adding a new right-pane mode.
- Keep `PreviewSection` visible in wide mode and focused via the existing `Panel` `focused` prop.
- Keep scroll state in `ConsoleApp`; avoid coupling scroll behavior to conversation polling.
- Prefer pure helper functions for scroll math so tests do not depend on terminal rendering snapshots.
- Added `resolveConsoleKeyAction()` as a pure helper for list/detail/input key routing.
- Added `buildPreviewViewport()` as a pure helper for visible chat lines, offset clamping, and scroll affordance state.
- Added `v view` to console help/footer shortcuts.

### Patterns & Best Practices

- Follow existing Ink component patterns and panel design-system usage.
- Keep new helpers exported only when tests need direct access.
- Avoid introducing new session parsing or file access in UI components.
- Clamp scroll offsets whenever viewport size or message count changes.

## Integration Points

- `useAgentConversation` continues to fetch selected-agent conversation data.
- `PreviewPane` receives already-loaded `ConversationMessage[]`; scroll changes must not fetch.
- `ConsoleApp` owns key routing and passes scroll/focus props down the preview tree.
- `PreviewSection` forwards clamped offsets from `PreviewPane` back to `ConsoleApp`.

## Error Handling

- Preserve current `PreviewPane` error states for missing session files, unsupported adapters, and parse errors.
- Detail focus with an error/empty/loading state should still render a focused panel and treat scroll as a no-op.
- Do not add console logging for normal key routing.

## Performance Considerations

- Scroll updates should be state-only UI updates.
- Keep existing conversation cache and polling interval unchanged unless implementation review identifies a functional gap.
- Avoid recalculating viewport structures more broadly than the loaded message array and current viewport need.

## Security Notes

- No new command execution, network calls, or writes.
- The feature only changes local display of already accessible agent session content.

## Implementation Results

Changed files:

- `packages/cli/src/tui/console/types.ts`: added `detail` focus state.
- `packages/cli/src/tui/console/consoleKeyRouting.ts`: added pure key-routing helper.
- `packages/cli/src/tui/console/ConsoleApp.tsx`: added detail scroll state, focus transitions, selected-agent scroll reset, and scroll-key handling.
- `packages/cli/src/tui/console/PreviewSection.tsx`: forwards focus, scroll offset, and clamp callback into the preview panel.
- `packages/cli/src/tui/console/PreviewPane.tsx`: added viewport helper, clamped offset reporting, scroll affordances, and line-based chat viewport rendering.
- `packages/cli/src/tui/console/HelpPane.tsx`: added `v view` hotkey.
- `packages/cli/src/__tests__/tui/console/PreviewPane.test.ts`: covers viewport helper behavior.
- `packages/cli/src/__tests__/tui/console/focusRouting.test.ts`: covers list/detail/input key routing.
- `packages/cli/src/__tests__/tui/console/HelpPane.test.ts`: covers new help/footer shortcut.

Simplification pass:

- `PreviewViewport` now returns typed rows instead of strings, so rendering uses `row.role` directly rather than inferring color from string prefixes.
- `ConsoleApp` key action handling now uses a `switch` to keep focus, scroll, and selection actions grouped in one dispatch block.
- `focusRouting.test.ts` now uses a local setup helper to remove repeated default key-routing inputs.

Design deviations:

- None. The implementation follows the reviewed design split: `ConsoleApp` owns requested offset and preview rendering clamps/report valid offsets.

Verification evidence:

- `npx vitest run src/__tests__/tui/console/PreviewPane.test.ts src/__tests__/tui/console/focusRouting.test.ts src/__tests__/tui/console/HelpPane.test.ts` passed: 3 files, 18 tests.
- `npx vitest run src/__tests__/tui/console` passed: 16 files, 106 tests.
- `npm run build` passed for all 6 projects.
- `npm run lint --workspace packages/cli` exited 0 with 5 pre-existing warnings outside touched files.
- `npx ai-devkit@latest lint --feature agent-console-detail-chat-view` passed after simplification.
