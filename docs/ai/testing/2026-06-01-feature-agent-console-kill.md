---
phase: testing
title: Agent Console Kill Testing
description: Test plan for confirmed kill support in agent console
---

# Testing Strategy

## Test Coverage Goals

- Unit coverage for new kill service branches.
- Command coverage for `agent kill` resolution behavior.
- Console/action coverage for kill action dispatch and confirmation keyboard behavior where practical.
- Manual TUI smoke test for the confirmation overlay.

## Unit Tests

### Agent Kill Service
- [x] Kills the selected agent PID with `SIGTERM`.
- [x] Kills the registry `tmuxSession` when present.
- [x] Falls back to `AgentRegistry.lookup(name).tmuxSession`.
- [x] Continues tmux cleanup when the process is already gone.
- [x] Does not call tmux when no tmux session exists.

### Console Actions
- [x] `runAction({ type: 'kill' })` spawns `agent kill <name>`.
- [x] Existing open/send action behavior is unchanged.

### Console UI
- [ ] Pressing lowercase `k` navigates up.
- [ ] Pressing uppercase `K` opens confirmation for the selected agent.
- [x] Confirmation renders as an overlay without changing computed pane dimensions.
- [ ] `Esc`/`n` cancels the pending kill.
- [ ] `Enter`/`y` confirms and dispatches the kill action.

## Integration Tests

- [x] `agent kill <name>` resolves an exact or unique partial agent and calls the kill service.
- [x] `agent kill <name>` reports no-match and ambiguous-match cases without killing anything.
- [x] `agent console` footer includes `K kill`.

## Manual Testing

- [ ] Start a managed tmux agent with `ai-devkit agent start`.
- [ ] Open `ai-devkit agent console`.
- [ ] Select the agent and press lowercase `k`; verify selection moves up.
- [ ] Press uppercase `K`; verify confirmation appears.
- [ ] Press `n`; verify the agent remains.
- [ ] Press uppercase `K` again, then `Enter`; verify the agent process exits and the tmux session is gone.

## Test Reporting & Coverage

- Run focused package tests for CLI and agent-manager changes.
- Run build or typecheck for touched packages before completion.

## Verification Results

- `npx vitest run src/__tests__/services/agent/agent.service.test.ts src/__tests__/commands/agent.test.ts src/__tests__/tui/console/actions/runAction.test.ts src/__tests__/tui/console/computeLayout.test.ts`: exit 0, 90 tests passed.
- `npm run build` in `packages/agent-manager`: exit 0.
- `npm run build` in `packages/cli`: exit 0.
- `npm run lint` in `packages/cli`: exit 0.
