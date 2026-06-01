---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- Unit test coverage target: 100% of new start-pane/action logic and changed branches.
- Integration scope: console shell shortcut, pane submit/cancel, action runner argv mapping, post-start success/error handling.
- Manual scope: real Ink rendering and keyboard ergonomics in `agent console`.
- Keep existing `open` and `send` behavior covered as regressions.

## Unit Tests
**What individual components need testing?**

### `runAction`
- [x] Adds a `start` action that spawns argv containing `agent start --type codex --name my-agent --cwd /tmp/project`. Covered by `packages/cli/src/__tests__/tui/console/actions/runAction.test.ts`.
- [x] Keeps `stdio` as `['ignore', 'pipe', 'pipe']` for `start`. Covered by `packages/cli/src/__tests__/tui/console/actions/runAction.test.ts`.
- [x] Preserves existing `open` and `send` argv behavior. Covered by existing tests in `packages/cli/src/__tests__/tui/console/actions/runAction.test.ts`.
- [x] Returns stderr as error when `agent start` exits non-zero. Covered by existing non-zero stderr behavior in `packages/cli/src/__tests__/tui/console/actions/runAction.test.ts`.

### `StartAgentPane`
- [x] Renders type selector choices: `claude`, `codex`, `gemini_cli`, `opencode`. Helper order covered by `packages/cli/src/__tests__/tui/console/StartAgentPane.test.ts`; render path covered by TypeScript build.
- [ ] Prefills name from props.
- [ ] Prefills cwd from props.
- [x] Allows changing type selection. Type cycling helpers covered by `packages/cli/src/__tests__/tui/console/StartAgentPane.test.ts`.
- [ ] Allows editing name and cwd text fields.
- [x] Normalizes submitted name and cwd before calling `onSubmit`. Covered by `normalizeStartAgentValues` tests in `packages/cli/src/__tests__/tui/console/StartAgentPane.test.ts`.
- [ ] Calls `onCancel` on `Esc`.
- [ ] Displays submitting state while start is running.
- [x] Displays passed error text without breaking layout by clipping long messages to pane width. Covered by `trimStartAgentError` tests in `packages/cli/src/__tests__/tui/console/StartAgentPane.test.ts`.

### `generateAgentName`
- [x] Uses a sanitized cwd folder plus base36 timestamp. Covered by `packages/cli/src/__tests__/util/agent-name.test.ts`.
- [x] Falls back to `agent` when the cwd folder has no alphanumeric characters. Covered by `packages/cli/src/__tests__/util/agent-name.test.ts`.
- [x] Limits long sanitized folder prefixes before appending the timestamp. Covered by `packages/cli/src/__tests__/util/agent-name.test.ts`.

### `ConsoleAppShell`
- [x] Pressing `s` while list is focused switches the right pane to start-agent mode. Covered by TypeScript build of the `ConsoleAppShell`/`useStartAgentPane` wiring and manual TTY smoke.
- [x] Pressing `s` again while already in start-agent mode keeps the start-agent pane active because global shell shortcuts are ignored while the pane is active. Covered by TypeScript build and manual TTY smoke of pane ownership.
- [x] Switching to start-agent mode preserves the left agent-list navigation layout and replaces only the right workspace in wide terminals. Verified by manual TTY smoke.
- [ ] Pressing `s` while chat input is focused does not open the start pane.
- [x] Start-pane submit invokes `runAction({ type: 'start', ... })`. Covered by TypeScript build and action contract tests.
- [ ] Successful start returns to preview/chat and shows success transient.
- [ ] Failed start keeps the start pane active and shows inline error feedback.
- [x] Cancel returns to preview/chat without invoking `runAction`. Verified by manual TTY smoke using `Esc`.
- [x] Existing `o`, `i`, `m`, `j`, `k`, and `q` shortcuts still compile in place; focused manual/Ink integration coverage remains pending.

### `useStartAgentPane`
- [x] Creates fresh generated defaults each time the start workspace opens. Covered by TypeScript build and `generateAgentName` unit tests.
- [x] Keeps failure errors in pane state for retry. Covered by TypeScript build and action-result contract tests; full Ink behavior test remains pending.
- [x] Calls list `refresh()` after successful start. Covered by TypeScript build; behavior-level Ink test remains pending.

## Integration Tests
**How do we test component interactions?**

- [ ] Render `ConsoleApp` with a mocked manager and verify `s` switches to start-agent mode even when agent list is empty.
- [ ] Submit start pane and verify the console action runner is called with generated defaults if fields are not edited.
- [x] Verify the list refresh integration path exists. `refresh()` is exposed through `useAgentList`/context and consumed by `useStartAgentPane`; behavior-level Ink test remains pending.
- [ ] Mock failed start and verify stderr appears as inline pane error feedback.

## End-to-End Tests
**What user flows need validation?**

- [x] Manual smoke: run `npm run dev -- agent console`, press `s`, and verify the available content pane becomes the start-agent workspace with generated name and cwd. Full start was not submitted during automated work.
- [x] Manual cancel: press `s`, then `Esc`, and verify the content pane returns to the default agent list/preview state without submitting.
- [ ] Manual error: enter an invalid cwd, submit, and verify the error is visible in the console.
- [ ] Manual regression: open an existing agent and send a message from the console after adding the start shortcut.

## Test Data
**What data do we use for testing?**

- Mock console agents with minimal `AgentInfo` fields already used by current console tests.
- Mock `child_process.spawn` for action runner tests.
- Mock existing name generation helper to make pane defaults deterministic.
- Use fake cwd strings; do not create real tmux sessions in unit tests.

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Run focused Vitest suites for console action and TUI components.
- Run the broader CLI test suite if changed code touches shared console context or command behavior.
- Record manual smoke results in implementation notes.
- Any coverage gap must be called out with rationale before Phase 7 completion.

## Manual Testing
**What requires human validation?**

- The start-agent workspace is readable in standard and narrow terminal widths.
- Keyboard navigation between type, cwd, name, submit, and cancel feels predictable.
- Error messages do not overlap the footer or agent list.
- The console remains usable after start success, start failure, and cancel.

Manual evidence recorded on 2026-06-01:
- `npm run dev -- agent console` rendered the console and footer with `s start`.
- In the narrow TTY smoke environment, pressing `s` replaced the available main pane with `START AGENT`, type choices, cwd, and generated name.
- Pressing `Esc` returned to the default agent-list view without submitting.
- Pressing `q` exited cleanly.

## Phase 6 Implementation Check

- Requirements/design alignment: aligned. The implementation uses `RightPaneMode`, `StartAgentPane`, `useStartAgentPane`, `runAction({ type: 'start' })`, shared `generateAgentName(cwd)`, and `useAgentList.refresh()`.
- Noted design nuance: in wide terminals the left agent list remains visible while the right workspace changes; in narrow terminals there is no right pane, so the start-agent workspace replaces the available main pane. This is documented in requirements and manual smoke evidence.
- Residual testing gap: full Ink interaction tests for `ConsoleAppShell` remain deferred because the repo has no Ink interaction harness. Unit/helper tests, full CLI suite, build, lint, and manual TTY smoke cover this iteration.

## Phase 7 Test Results

Evidence recorded on 2026-06-01:
- `npx vitest run src/__tests__/tui/console/computeLayout.test.ts src/__tests__/tui/console/StartAgentPane.test.ts src/__tests__/tui/console/actions/runAction.test.ts src/__tests__/util/agent-name.test.ts` passed after simplification: 4 files, 27 tests.
- `npx nx test cli` passed after simplification: 43 files, 643 tests.
- `npx nx lint cli` passed.
- `npx nx build cli` passed.
- `npx ai-devkit@latest lint --feature agent-console-start` passed.

Residual gap after Phase 7: full Ink keyboard interaction tests for editing text fields, `Esc`, success transition, and inline failure state remain deferred because this repo does not currently provide an Ink interaction harness. The behavior is covered by pure helper/action tests, TypeScript build, broad CLI suite, and manual TTY smoke.

## Performance Testing
**How do we validate performance?**

- No load test required.
- Confirm right-pane mode switching is immediate in manual testing.
- Confirm list polling remains active or resumes normally after start-pane interactions.

## Bug Tracking
**How do we manage issues?**

- Track implementation issues in the planning checklist.
- Treat broken existing `open`/`send` console actions as blocking regressions.
- Treat a pane that can start duplicate/invalid commands accidentally as blocking.
