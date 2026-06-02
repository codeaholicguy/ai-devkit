---
phase: planning
title: Agent Console Rename Plan
description: Task breakdown for selected-agent rename support in agent console
---

# Project Planning & Task Breakdown

## Milestones

- [x] Milestone 1: Console action contract supports `agent rename`.
- [x] Milestone 2: Native rename workspace is wired into `agent console`.
- [x] Milestone 3: Focused tests and manual TTY smoke validate rename, cancel, and error flows.

## Task Breakdown

### Phase 1: Foundation

- [x] Task 1.1: Extend `ConsoleAction` with `{ type: 'rename'; currentName: string; newName: string }`.
- [x] Task 1.2: Extend `runAction` to map rename to `agent rename <currentName> <newName>`.
- [x] Task 1.3: Add action runner tests for rename argv, piped stdio, and error propagation.

### Phase 2: Core Features

- [x] Task 2.1: Implement `RenameAgentPane` as a native workspace with current-name display, editable new-name field, submit, cancel, error, and submitting states.
- [x] Task 2.2: Add pane/helper tests for prefill, trimming, cancel, submit, and error display.
- [x] Task 2.3: Wire lowercase `r` in `ConsoleAppShell` to open rename mode for the selected agent only when global shell shortcuts own input.
- [x] Task 2.4: On pane submit, invoke `runAction({ type: 'rename', currentName, newName })`, show success/error feedback, and prevent duplicate submits while running.
- [x] Task 2.5: On successful rename, return to preview mode without calling `refresh()`.

### Phase 3: Integration & Polish

- [x] Task 3.1: Update `StatusFooter` shortcut text to include `r rename`.
- [x] Task 3.2: Add focused regression coverage for existing console actions and shortcut text where practical.
- [x] Task 3.3: Run focused tests, `npx nx test cli`, `npx nx lint cli`, and `npx nx build cli`.
- [x] Task 3.4: Manually smoke-test `agent console` for rename workspace layout and keyboard behavior.
- [x] Task 3.5: Update implementation notes with evidence and deviations.

## Dependencies

- Task 1.1 and 1.2 must happen before pane submit wiring.
- Task 2.1 should follow existing console start-pane layout patterns.
- Task 2.3 depends on current `ConsoleAppShell` focus and mode handling.
- Manual smoke depends on a local terminal capable of running Ink and at least one listed agent to select.

## Timeline & Estimates

- Foundation/action runner: 30-60 minutes.
- Rename workspace and shell wiring: 2-3 hours.
- Tests and polish: 2-3 hours.
- Manual smoke and docs update: 30-60 minutes.

## Risks & Mitigation

| Risk | Mitigation |
|---|---|
| `r` conflicts with active text input | Gate global shortcut handling the same way start-pane shortcuts are gated |
| Console behavior diverges from CLI rename | Shell out through `runAction` and keep validation in `agent rename` |
| Name appears stale after success | This is accepted by user decision; document that the next polling refresh updates it |
| Narrow terminal layout clips input/errors | Reuse start-pane layout constraints and add helper tests for trimming |
| Full Ink interaction tests are limited | Cover pure helpers/action mapping and record manual TTY smoke evidence |

## Resources Needed

- Existing console implementation in `packages/cli/src/tui/console`.
- Existing `agent rename` command and tests.
- Existing `agent console start` implementation as the workspace pattern reference.
- Local terminal for manual Ink smoke testing.

## Phase 5 Planning Reconciliation

All planned implementation tasks are complete. No new implementation tasks were discovered.

Completed scope:

- Console action contract supports `rename`.
- Native rename workspace is implemented and wired into `agent console`.
- Footer/help metadata includes `r rename`.
- Successful rename returns to preview without an explicit refresh, matching the user decision.
- Focused tests, full CLI tests, lint, build, base docs lint, and limited manual TTY smoke have been run.

Residual validation note: the local manual smoke environment had no running agents, so it validated console rendering, `r rename` footer text, clean quit, and the no-selected-agent `r` guard. Selected-agent rename interaction remains covered by focused action/lifecycle tests and TypeScript build, not live TTY execution.

Next phase: Phase 6 implementation check.
