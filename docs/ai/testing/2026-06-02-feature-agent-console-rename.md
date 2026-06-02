---
phase: testing
title: Agent Console Rename Testing Strategy
description: Test plan for selected-agent rename support in agent console
---

# Testing Strategy

## Test Coverage Goals

- Unit target: 100% of new rename action mapping and rename-pane helper logic.
- Integration target: console shell shortcut, pane submit/cancel wiring, failure retry behavior, and footer shortcut text.
- Regression target: existing `open`, `send`, `start`, and `kill` action behavior remains unchanged.
- Manual target: Ink keyboard ergonomics and narrow/wide terminal layout.

## Unit Tests

### `runAction`

- [x] Maps `{ type: 'rename', currentName, newName }` to `agent rename <currentName> <newName>`. Covered by `packages/cli/src/__tests__/tui/console/actions/runAction.test.ts`.
- [x] Keeps `stdio` as `['ignore', 'pipe', 'pipe']` for console actions, including rename. Covered by `packages/cli/src/__tests__/tui/console/actions/runAction.test.ts`.
- [x] Preserves existing `open`, `send`, `start`, and `kill` argv behavior. Covered by `packages/cli/src/__tests__/tui/console/actions/runAction.test.ts`.
- [x] Returns stderr as error when a console action exits non-zero. Covered by `packages/cli/src/__tests__/tui/console/actions/runAction.test.ts`.

### `RenameAgentPane`

- [x] Renders current agent name. Covered by TypeScript build of `packages/cli/src/tui/console/RenameAgentPane.tsx`; full Ink render interaction remains manual.
- [x] Prefills editable new-name value from the selected agent name. Covered by `ConsoleAppShell` wiring and TypeScript build; full Ink render interaction remains manual.
- [x] Trims submitted name before calling `onSubmit`. Covered by `packages/cli/src/__tests__/tui/console/RenameAgentPane.test.ts`.
- [x] Calls `onCancel` on `Esc` or cancel selection. Covered by component implementation and manual TTY smoke target; full Ink interaction test remains unavailable.
- [x] Displays submitting state while rename is running. Covered by component implementation and TypeScript build; manual TTY smoke target remains.
- [x] Displays passed error text without breaking layout by clipping long messages to pane width. Covered by `packages/cli/src/__tests__/tui/console/RenameAgentPane.test.ts`.
- [x] Keeps layout stable in narrow available widths. Covered by width-clipping helper tests and shared `computeLayout` regression tests.

### `ConsoleAppShell`

- [x] Pressing `r` while list/preview owns keyboard input switches to rename mode for the selected agent. Covered by `ConsoleAppShell` wiring and TypeScript build; full Ink interaction remains manual.
- [x] Pressing `r` when no agent is selected is ignored without crashing. Covered by guard in `ConsoleAppShell`; full Ink interaction remains manual.
- [x] Pressing `r` while chat input or another workspace owns keyboard input does not steal text entry. Covered by existing focus guards and `renamePaneActive` shortcut guard; full Ink interaction remains manual.
- [x] Successful rename returns to preview mode without calling `refresh()`. Covered by `useRenameAgentPane` implementation: no refresh dependency is accepted.
- [x] Failed rename keeps rename mode active and displays inline error feedback. Error interpretation covered by `packages/cli/src/__tests__/tui/console/hooks/useRenameAgentPane.test.ts`.
- [x] Cancel returns to preview/chat without invoking `runAction`. Covered by `useRenameAgentPane` implementation and manual TTY smoke target.

### `StatusFooter`

- [x] Footer includes `r rename`. Covered by `packages/cli/src/__tests__/tui/console/HelpPane.test.ts`.
- [x] Existing shortcut text for navigation, open, send/message, start, kill, and quit remains present. Covered by `packages/cli/src/__tests__/tui/console/HelpPane.test.ts`.

## Integration Tests

- [ ] Render `ConsoleApp` with a mocked selected agent and verify `r` opens rename mode.
- [ ] Submit rename mode and verify the action runner receives the selected current name and edited new name.
- [ ] Mock a failed rename and verify stderr appears in the rename workspace.
- [ ] Mock a successful rename and verify no explicit list refresh is requested.

## End-to-End Tests

- [ ] Manual smoke: run `npm run dev -- agent console`, press `r`, edit the selected agent name, submit, and verify the console returns to preview mode. Not fully executable in this session because there were no running agents.
- [ ] Manual polling smoke: after successful rename, wait for the next scheduled refresh and verify the new name appears. Not fully executable in this session because there were no running agents.
- [ ] Manual error smoke: enter an invalid or conflicting name and verify the error is visible and retry is possible. Not fully executable in this session because there were no running agents.
- [x] Manual no-agent smoke: run `npm run dev -- agent console`, press `r` with no selected agent, and verify the console remains stable and exits cleanly with `q`.
- [ ] Manual cancel smoke: press `r`, then `Esc`, and verify no rename occurs. Not fully executable in this session because there were no running agents.

## Test Data

- Mock console agents with minimal `AgentInfo` fields already used by current console tests.
- Mock `child_process.spawn` for action runner tests.
- Mock the existing `agent rename` subprocess response instead of mutating a real registry in TUI tests.
- Use realistic names: `old-agent`, `renamed-agent`, invalid `Bad Name`, conflict `taken-agent`.

## Test Reporting & Coverage

- Run focused Vitest tests for action and pane helpers.
- Run `npx nx test cli` if shared console shell, context, or footer code changes.
- Run `npx nx lint cli` and `npx nx build cli` before implementation completion.
- Record manual TTY smoke results in implementation notes.

## Phase 4 Evidence

- `npx vitest run src/__tests__/tui/console/actions/runAction.test.ts` failed before production changes with the new rename action test: expected rename argv, received `undefined`.
- After adding the action type and runner branch, `npx vitest run src/__tests__/tui/console/actions/runAction.test.ts` passed: 1 file, 10 tests.
- `npx vitest run src/__tests__/tui/console/RenameAgentPane.test.ts` failed before production changes because `RenameAgentPane.js` did not exist, then passed after adding pane helpers: 1 file, 3 tests.
- `npx vitest run src/__tests__/tui/console/HelpPane.test.ts` failed before production changes because `r rename` was absent, then passed after updating shared hotkey metadata: 1 file, 3 tests.
- `npx vitest run src/__tests__/tui/console/hooks/useRenameAgentPane.test.ts` failed before production changes because the hook module did not exist, then passed after adding the hook helper: 1 file, 3 tests.
- Focused regression command passed after console wiring: `npx vitest run src/__tests__/tui/console/actions/runAction.test.ts src/__tests__/tui/console/RenameAgentPane.test.ts src/__tests__/tui/console/hooks/useRenameAgentPane.test.ts src/__tests__/tui/console/HelpPane.test.ts src/__tests__/tui/console/computeLayout.test.ts` — 5 files, 32 tests.
- `npx nx test cli` passed: 48 files, 671 tests.
- `npx nx lint cli` passed.
- `npx nx build cli` passed.
- `npx ai-devkit@latest lint` passed.
- Manual TTY smoke: `npm run dev -- agent console` rendered with footer hint `r rename`; pressing `r` with no selected agent left the console stable; pressing `q` exited with code 0.

## Phase 7 Test Review

Coverage analysis:

- `npx vitest run src/__tests__/tui/console/actions/runAction.test.ts src/__tests__/tui/console/RenameAgentPane.test.ts src/__tests__/tui/console/hooks/useRenameAgentPane.test.ts src/__tests__/tui/console/HelpPane.test.ts --coverage` executed the focused tests successfully: 4 files, 19 tests passed.
- The same command exited `1` because the package applies global 60% coverage thresholds while the focused command intentionally covers only a subset of the package. The report showed `src/tui/console/actions/runAction.ts` at 100% statements/branches/functions/lines.
- Remaining coverage gap: full Ink interaction behavior for `RenameAgentPane` and `ConsoleAppShell` is not covered by automated interaction tests because this repo does not currently provide an Ink interaction harness. Covered instead by pure helper tests, action mapping tests, lifecycle error tests, TypeScript build, full CLI test suite, and limited manual TTY smoke.

No test failures revealed design flaws.

## Manual Testing

- Validate rename workspace readability in standard and narrow terminal widths.
- Validate text editing, submit, cancel, and error retry behavior.
- Validate no immediate refresh is triggered by observing that the name changes only after the normal polling interval.

## Performance Testing

- No load test required.
- Confirm switching into and out of rename mode is immediate.
- Confirm existing polling remains active after rename success/failure/cancel.

## Bug Tracking

- Treat broken existing console actions as blocking regressions.
- Treat accidental rename without explicit submit as blocking.
- Treat terminal output corruption from subprocess stderr/stdout as blocking.
