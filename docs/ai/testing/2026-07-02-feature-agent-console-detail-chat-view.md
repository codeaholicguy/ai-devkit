---
phase: testing
title: Agent Console Detail Chat View - Testing Strategy
description: Test coverage for focused and scrollable chat content in the interactive agent console
---

# Testing Strategy

## Test Coverage Goals

- Cover 100% of new pure helper logic for detail viewport calculation and scroll clamping.
- Cover key focus-routing behavior where it can be isolated without brittle full-screen Ink snapshots.
- Preserve existing preview, list, input, help, start, rename, channel, and kill behavior.
- Validate feature docs and affected test suites before claiming implementation readiness.

## Unit Tests

### PreviewPane viewport helpers

- [x] Returns the newest content when `scrollOffset` is `0`.
- [x] Returns older content when `scrollOffset` is positive.
- [x] Clamps negative offsets to `0`.
- [x] Clamps offsets above the maximum available scroll range.
- [x] Reports `hasAbove` and `hasBelow` correctly for long conversations.
- [x] Handles empty/error/loading body states without scroll affordances.
- [x] Preserves role labels and multi-line message indentation in rendered line accounting.

### ConsoleApp focus/key helpers

- [x] `v` from list focus enters detail focus only when an agent is selected and preview is visible.
- [x] Up/down and `j/k` keep changing selected agent while list focus is active.
- [x] Up/down and `j/k` change detail scroll offset while detail focus is active.
- [x] `Esc` and left arrow return from detail focus to list focus.
- [x] `i`/`m` still enter input focus when an agent is selected.
- [x] Detail scroll offset resets when selected agent changes.

## Integration Tests

- [x] Render `PreviewSection` with focused state and verify the panel receives focused styling.
- [x] Render a long conversation and verify visible output changes when scroll offset changes.
- [x] Verify no adapter/conversation fetch is triggered by scroll-only state changes beyond the existing polling hook behavior.

## End-to-End Tests

- [ ] Manual flow: open `ai-devkit agent console`, select an agent, press `v`, confirm detail pane highlight.
- [ ] Manual flow: scroll up/down through chat and confirm selected agent does not change while detail is focused.
- [ ] Manual flow: press `Esc` or left arrow and confirm list navigation resumes.
- [ ] Regression flow: press `i`/`m`, type and submit a message, confirm input behavior is unchanged.

## Test Data

- Inline `ConversationMessage[]` fixtures with at least three roles and multi-line assistant content.
- Mock `AgentInfo` entries matching existing console tests.
- Existing `AgentManager`/adapter mocks for conversation hook tests.

## Test Reporting & Coverage

- Run targeted console tests during implementation:
  - `npm test -- --run packages/cli/src/__tests__/tui/console`
- Run broader package validation before final review if touched files require it:
  - `npm test -- --run packages/cli/src/__tests__/commands/agent.test.ts packages/cli/src/__tests__/tui/console`
- Record exact command output and feature lint evidence in the task trace.

Latest results:

- `npx vitest run src/__tests__/tui/console/PreviewPane.test.ts src/__tests__/tui/console/focusRouting.test.ts src/__tests__/tui/console/HelpPane.test.ts`: 3 files passed, 18 tests passed.
- `npx vitest run src/__tests__/tui/console`: 16 files passed, 106 tests passed.
- `npm run build`: 6 projects built successfully.
- `npm run lint --workspace packages/cli`: exited 0 with 5 warnings in unrelated existing files.
- Simplification verification:
  - `npx vitest run src/__tests__/tui/console/PreviewPane.test.ts src/__tests__/tui/console/focusRouting.test.ts src/__tests__/tui/console/HelpPane.test.ts`: 3 files passed, 18 tests passed.
  - `npx vitest run src/__tests__/tui/console`: 16 files passed, 106 tests passed.
  - `npm run lint --workspace packages/cli`: exited 0 with 5 warnings in unrelated existing files.
  - `npx ai-devkit@latest lint --feature agent-console-detail-chat-view`: passed.
- Manual PTY smoke:
  - `node packages/cli/dist/cli.js agent list --json` returned 5 agents before and after the PTY run.
  - Narrow PTY run rendered the list-only layout, displayed the expected `resize >=120 cols` warning, accepted `q`, and exited 0.
  - Wide PTY run rendered the two-pane layout, accepted key input, accepted `q`, and exited 0.
  - Selected-agent detail focus could not be manually verified in the PTY because the console's live scan returned 0 agents in that PTY even though `agent list --json` returned 5 agents in normal command mode.

## Manual Testing

- Confirm focused and unfocused panel states are visually distinct in a real terminal.
- Confirm scroll affordances are visible but not noisy.
- Confirm narrow terminal behavior does not trap focus in a hidden preview.

## Performance Testing

- Use a fixture with many loaded messages to validate scroll helper performance remains simple and synchronous.
- Confirm scroll keypresses do not parse JSONL session files.

## Bug Tracking

- Track any discovered defects in the feature planning doc during implementation.
- Treat focus traps, broken list navigation, and broken message input as blocking regressions.
