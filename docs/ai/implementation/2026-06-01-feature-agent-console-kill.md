---
phase: implementation
title: Agent Console Kill Implementation
description: Implementation notes for confirmed kill support in agent console
---

# Implementation Guide

## Development Setup

- Feature worktree: `.worktrees/feature-agent-console-kill`
- Branch: `feature-agent-console-kill`
- Dependency bootstrap: `npm ci` completed. Husky prepare could not lock the main repo git config from the sandbox, but dependency install exited successfully.

## Code Structure

- `packages/cli/src/services/agent/agent.service.ts`
  - Added `killAgent()` service.
- `packages/cli/src/commands/agent.ts`
  - Added `agent kill <name>`.
- `packages/cli/src/tui/console/actions/types.ts`
  - Added `kill` console action.
- `packages/cli/src/tui/console/actions/runAction.ts`
  - Dispatches kill through a CLI subprocess.
- `packages/cli/src/tui/console/ConsoleApp.tsx`
  - Handles uppercase `K`, confirmation state, and kill result messages.
- `packages/cli/src/tui/console/KillConfirmDialog.tsx`
  - New Ink confirmation dialog.
- `packages/cli/src/tui/console/StatusFooter.tsx`
  - Documents `K kill`.

## Implementation Notes

### Core Features

- `killAgent()` sends `SIGTERM` to the selected agent PID.
- `killAgent()` looks up the registry entry by agent name and kills the stored `tmuxSession` when present.
- `ESRCH` process-kill errors are treated as already stopped so tmux cleanup still runs.
- `agent kill <name>` uses existing list/resolve behavior and reuses the no-match/ambiguous-match messaging style from existing commands.
- `agent console` keeps lowercase `k` navigation and uses uppercase `K` to open a confirmation dialog.
- Confirming with `Enter` or `y` dispatches `agent kill <name>` through `runAction`; cancelling with `Esc` or `n` closes the dialog without side effects.
- `KillConfirmDialog` is rendered inside an absolute-positioned `Box` centered from terminal dimensions, so opening it does not shrink the agent list, preview pane, input box, or footer.

### Patterns & Best Practices

- Console actions remain subprocess-based so the Ink TUI keeps terminal control.
- Tmux cleanup is centralized in the service layer, not the TUI.
- Process killing is dependency-injected in tests via `killProcess`.

## Error Handling

- CLI command resolution failures return visible `ui.error`/`ui.info` messages and do not call `killAgent`.
- Non-`ESRCH` process kill errors propagate through the existing `withErrorHandler` path.
- TUI action failures are shown as transient footer errors.

## Verification Evidence

- `npx ai-devkit@latest lint --feature agent-console-kill` exited 0.
- `npm run build` in `packages/agent-manager` exited 0.
- `npm run build` in `packages/cli` exited 0.
- `npm run lint` in `packages/cli` exited 0.
- `npx vitest run src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts src/__tests__/tui/console/actions/runAction.test.ts src/__tests__/tui/console/computeLayout.test.ts` exited 0 with 90 passing tests.

## Phase 6 Implementation Check

### Alignment Status

- Requirements alignment: pass.
  - Uppercase `K` opens kill confirmation.
  - Lowercase `k` navigation remains unchanged.
  - Confirmed kill dispatches through `agent kill <name>`.
  - The kill service sends `SIGTERM` and kills registry-backed `tmuxSession` when present.
  - Console errors are surfaced as transient messages.
- Design alignment: pass.
  - `ConsoleAction` includes `kill`.
  - `runAction` spawns `agent kill <name>` with piped stdio.
  - `agent kill` resolves agents through `AgentManager.listAgents()` and `resolveAgent()`.
  - `killAgent()` centralizes process and tmux cleanup.
  - `KillConfirmDialog` is absolute-positioned so it does not resize the main UI panes.

### File-by-File Notes

- `packages/cli/src/services/agent/agent.service.ts`: matches design. `ESRCH` is handled as already stopped, while unexpected process errors still propagate.
- `packages/cli/src/commands/agent.ts`: matches existing command resolution patterns for no agents, no match, ambiguous match, and success.
- `packages/cli/src/tui/console/ConsoleApp.tsx`: matches the keyboard flow. Confirmation handling has priority over normal shortcuts while pending.
- `packages/cli/src/tui/console/KillConfirmDialog.tsx`: matches the overlay design and does not own kill behavior.
- `packages/cli/src/tui/console/actions/*`: matches existing subprocess action pattern.
- `packages/cli/src/tui/console/StatusFooter.tsx`: documents `K kill`.

### Deviations and Follow-Ups

- No blocking deviations found.
- Follow-up for Phase 7: add or manually execute coverage for live Ink key handling (`k`, `K`, `n`/`Esc`, `Enter`/`y`) and the managed tmux smoke test.
