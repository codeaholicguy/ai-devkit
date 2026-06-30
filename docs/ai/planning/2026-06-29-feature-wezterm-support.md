---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones
**What are the major checkpoints?**

- [ ] M1: WezTerm discovery returns a `WEZTERM` location (unit-tested).
- [ ] M2: Focus + send work end-to-end against the WezTerm CLI (unit-tested).
- [ ] M3: Full package test suite green; docs updated; PR opened.

## Task Breakdown
**What specific work needs to be done?**

### Phase 1: Discovery
- [x] T1.1: Add `WEZTERM = 'wezterm'` to `TerminalType`.
- [x] T1.2: Add `findWeztermPane(tty)` calling `wezterm cli list --format json`,
      matching `tty` → `pane_id`; swallow ENOENT/parse/non-zero.
- [x] T1.3: Insert WezTerm probe in `findTerminal` after tmux, before iTerm2.

### Phase 2: Control
- [x] T2.1: Add `focusWeztermPane(paneId)` (`wezterm cli focus-pane --pane-id`)
      and a `WEZTERM` case in `focusTerminal`.
- [x] T2.2: Add `sendViaWezterm(identifier, message)` (two-step text + Enter via
      stdin) and a `WEZTERM` case in `TtyWriter.send`.

### Phase 3: Tests & Docs
- [x] T3.1: Unit tests in `TerminalFocusManager.test.ts` (found / not-installed
      / no-match / malformed-json / precedence / no-osascript / focus ok / focus
      fail).
- [x] T3.2: Unit tests in `TtyWriter.test.ts` (two-step send / pane-id / failure
      / still-unsupported).
- [x] T3.3: Update `packages/agent-manager/README.md` terminal support list.
- [ ] T3.4: Run `npm test` (done); simplify-implementation review (done, no changes); commit; open PR.

## Dependencies
**What needs to happen in what order?**

- T1.1 → T1.2 → T1.3 (enum before its consumers).
- T2.* depend on T1.1.
- T3.1/T3.2 written before/with their targets (TDD).

## Timeline & Estimates
**When will things be done?**

- Single small, well-scoped change; all phases in one session.

## Risks & Mitigation
**What could go wrong?**

- WezTerm JSON schema drift across versions → mitigate by reading only `tty` and
  `pane_id` defensively and falling back to `null` on any anomaly.
- Cannot run real WezTerm in CI → rely on execFile-mocked unit tests; document
  manual verification.

## Resources Needed
**What do we need to succeed?**

- Existing vitest + execFile mock harness in `__tests__/terminal/`.
