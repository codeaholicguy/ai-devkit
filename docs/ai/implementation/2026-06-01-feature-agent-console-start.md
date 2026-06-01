---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
**How do we get started?**

- Worktree: `.worktrees/feature-agent-console-start`
- Branch: `feature-agent-console-start`
- Dependency bootstrap: `npm ci` completed in the worktree.
- Validation entrypoints used during implementation:
  - `npx vitest run src/__tests__/util/agent-name.test.ts src/__tests__/tui/console/actions/runAction.test.ts`
  - `npx vitest run src/__tests__/tui/console/StartAgentPane.test.ts`
  - `npx vitest run src/__tests__/tui/console/computeLayout.test.ts src/__tests__/tui/console/StartAgentPane.test.ts src/__tests__/tui/console/actions/runAction.test.ts src/__tests__/util/agent-name.test.ts`
  - `npx nx build cli`
  - `npx ai-devkit@latest lint --feature agent-console-start`
  - Manual TTY smoke: `npm run dev -- agent console`, press `s`, press `Esc`, press `q`.

## Code Structure
**How is the code organized?**

- `packages/cli/src/util/agent.ts`: shared `generateAgentName(cwd)` helper extracted from the `agent start` command.
- `packages/cli/src/tui/console/actions/types.ts`: adds the `start` console action.
- `packages/cli/src/tui/console/actions/runAction.ts`: maps `start` to `agent start --type --name --cwd` through the same subprocess path as `open` and `send`.
- `packages/cli/src/tui/console/StartAgentPane.tsx`: native Ink right-pane workspace with type selection, cwd/name text fields, submit/cancel controls, submitting state, and inline errors.
- `packages/cli/src/tui/console/ConsoleApp.tsx`: switches the right pane to start-agent mode on `s`, routes start-pane submit/cancel callbacks, renders the active workspace, and keeps global shortcuts disabled while the start pane owns keyboard input.
- `packages/cli/src/tui/console/hooks/useStartAgentPane.ts`: owns generated defaults, start submit/cancel lifecycle, inline error state, success transient, and post-success list refresh.
- `packages/cli/src/tui/console/hooks/useAgentList.ts`: exposes `refresh()` while preserving existing polling/equality behavior.
- `packages/cli/src/tui/console/StatusFooter.tsx`: documents the new `s start` shortcut.

## Implementation Notes
**Key technical details to remember:**

### Core Features
- `generateAgentName(cwd)` behavior was preserved exactly and covered with unit tests for sanitized folder names and fallback `agent-*` names.
- `runAction({ type: 'start', agentType, name, cwd })` shells out to the current CLI entry with argv entries, not shell interpolation.
- `StartAgentPane` owns form state locally. Type selection cycles through `claude`, `codex`, `gemini_cli`, and `opencode`; cwd and name use `ink-text-input`.
- `ConsoleAppShell` ignores global shortcuts while the start pane is active so the pane owns keyboard handling.
- The left agent list remains the stable navigation area in wide terminals; the right workspace switches between preview/chat and start-agent. In narrow terminals, start-agent replaces the available main pane.
- `useStartAgentPane` creates fresh generated defaults each time the start workspace opens.
- Start failure keeps the start-agent pane active and displays inline error text. Start success returns to preview/chat, shows `Started <name>`, and awaits `refresh()`.
- Manual TTY smoke confirmed narrow-mode behavior: `s` replaces the available main pane with `START AGENT`, `Esc` returns to the default view, and `q` exits cleanly.

### Patterns & Best Practices
- Keep TUI subprocess interactions centralized in `runAction`.
- Keep agent-list loading centralized in `useAgentList`; `refresh()` reuses the hook's same in-flight guard, equality check, and error handling.
- Use stable callbacks for console actions to avoid unnecessary React churn.
- Keep right-pane workspace dimensions derived from the existing console layout calculation.

## Integration Points
**How do pieces connect?**

- `agent start` remains the source of truth for validation, tmux creation, PID polling, registry updates, and attach output.
- The console start pane only collects values and invokes the CLI through `runAction`.
- `ConsoleProvider` passes through `refresh()` from `useAgentList`; `useStartAgentPane` calls it after successful start.

## Error Handling
**How do we handle failures?**

- `runAction` captures stderr from the `agent start` subprocess.
- Non-zero start exits keep `StartAgentPane` active and render the captured stderr inline.
- If stderr is unavailable, the pane displays `start exited <code>`.
- Duplicate submits are ignored while `isStartingAgent` is true.
- Cancel is ignored while a start action is in flight.

## Performance Considerations
**How do we keep it fast?**

- The start pane does not introduce new polling.
- `refresh()` preserves the existing in-flight guard so manual refresh cannot overlap the poller's active request.
- Quiet polls still skip state updates when agent data is unchanged.

## Security Notes
**What security measures are in place?**

- User-provided `type`, `name`, and `cwd` values are passed as `spawn` argv entries, never interpolated into a shell string.
- Validation stays in `agent start`; the pane does not duplicate or weaken command validation.
- No secrets or persistent data are introduced by the pane itself.
