---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones
**What are the major checkpoints?**

- [x] Milestone 1: Console action contract supports `agent start`.
- [x] Milestone 2: Native Ink start workspace is wired into `agent console`.
- [x] Milestone 3: Tests and manual console smoke validate start, cancel, and failure flows.

## Task Breakdown
**What specific work needs to be done?**

### Phase 1: Foundation
- [x] Task 1.1: Locate the existing generated-name helper used by `agent start` and export/reuse it from TUI code without changing generated output.
- [x] Task 1.2: Extend `ConsoleAction` with `{ type: 'start'; agentType; name; cwd }`.
- [x] Task 1.3: Extend `runAction` to map the start action to `agent start --type --name --cwd`.
- [x] Task 1.4: Add action runner tests for start argv, piped stdio, and error propagation.

### Phase 2: Core Features
- [x] Task 2.1: Implement `StartAgentPane` as a native right-pane workspace with type selection, cwd text input, name text input, submit, cancel, error, and submitting states.
- [x] Task 2.2: Add pane/helper unit tests for rendering, navigation, submit, cancel, and error display.
- [x] Task 2.3: Wire `s` in `ConsoleAppShell` to switch the right pane to start-agent mode only when list focus owns keyboard input.
- [x] Task 2.4: On pane submit, invoke `runAction({ type: 'start', ... })`, show success/error transient feedback, and prevent duplicate submits while running.
- [x] Task 2.5: Expose or reuse a console refresh method so successful start can refresh the list immediately.

### Phase 3: Integration & Polish
- [x] Task 3.1: Update `StatusFooter` shortcut text to include `s start`.
- [x] Task 3.2: Add focused tests for action argv, layout calculation, start-pane helpers, generated names, and existing shortcut regressions. Full Ink interaction harness remains absent and is covered by manual smoke.
- [x] Task 3.3: Run focused test suites and broader CLI tests as needed.
- [x] Task 3.4: Manually smoke-test `agent console` in a terminal for start-workspace layout and keyboard behavior.
- [x] Task 3.5: Update implementation notes with evidence and any deviations.

## Dependencies
**What needs to happen in what order?**

- Task 1.1 should happen before pane wiring so defaults use the real helper.
- Task 1.2 and 1.3 should happen before pane submit wiring.
- Task 2.1 can start once pane props and action shape are clear.
- Task 2.5 depends on how `ConsoleProvider` currently owns polling/list loading.
- Manual smoke depends on local availability of at least one supported agent binary and tmux.

## Timeline & Estimates
**When will things be done?**

- Foundation/action runner: 1-2 hours.
- Modal component and keyboard handling: 3-5 hours.
- Console integration and refresh: 2-3 hours.
- Tests and manual smoke: 2-4 hours.
- Main uncertainty: Ink text-input/selection ergonomics in the existing layout.

## Risks & Mitigation
**What could go wrong?**

- **Keyboard handling conflict:** Start-pane shortcuts could conflict with list/chat input. Mitigation: gate `s` by focus and let the active right-pane workspace own relevant input.
- **Duplicate submissions:** Users could press Enter repeatedly. Mitigation: `isSubmitting` disables repeated submit.
- **Name helper coupling:** Existing helper may be command-local. Mitigation: extract to a small utility with tests preserving current behavior.
- **Refresh duplication:** Console list loading may not be externally triggerable. Mitigation: expose a minimal refresh callback from context instead of duplicating manager calls.
- **Narrow terminal layout:** The right-pane workspace may be hidden in narrow mode. Mitigation: when narrow, replace the main content area with the start-agent pane rather than requiring the preview column.

## Resources Needed
**What do we need to succeed?**

- Existing console implementation in `packages/cli/src/tui/console`.
- Existing `agent start` implementation in `packages/cli/src/commands/agent.ts`.
- Existing console action tests under `packages/cli/src/__tests__/tui/console`.
- Local terminal for manual Ink smoke testing.

## Current Status

Implementation now uses the right-pane workspace pattern. `s` switches the dynamic workspace from preview/chat to the native Ink start-agent form, name/cwd are prefilled, type is selectable, submit shells out through the existing console action runner to `agent start --type --name --cwd`, failures stay inline, and successful starts refresh the agent list before returning to preview/chat. This replaces the earlier overlay/modal approach and establishes the intended pattern for future console features.
