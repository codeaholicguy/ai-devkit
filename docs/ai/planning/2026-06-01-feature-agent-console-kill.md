---
phase: planning
title: Agent Console Kill Plan
description: Task breakdown for confirmed kill support in agent console
---

# Project Planning & Task Breakdown

## Milestones

- [x] Milestone 1: CLI kill service and command implemented.
- [x] Milestone 2: Console confirmation UI and `K` keybinding implemented.
- [x] Milestone 3: Tests, docs, and verification complete.

## Task Breakdown

### Phase 1: CLI Kill Path
- [x] Task 1.1: Add `killAgent` service that sends `SIGTERM` and kills tmux session when available.
- [x] Task 1.2: Add `agent kill <name>` command with no-match and ambiguous-match handling.
- [x] Task 1.3: Add command/service tests for process kill and tmux cleanup.

### Phase 2: Console Integration
- [x] Task 2.1: Extend console action types and `runAction` with `kill`.
- [x] Task 2.2: Add confirmation overlay component.
- [x] Task 2.3: Wire uppercase `K` to open confirmation while preserving lowercase `k` navigation.
- [x] Task 2.4: Show kill result/error through transient footer messages.

### Phase 3: Verification
- [x] Task 3.1: Update footer/docs hints.
- [x] Task 3.2: Run focused tests.
- [x] Task 3.3: Run build/typecheck for touched packages.

## Dependencies

- Existing `AgentManager.resolveAgent` behavior for name resolution.
- Existing `TmuxManager.killSession` behavior for tmux cleanup.
- Existing console subprocess action pattern.

## Timeline & Estimates

- CLI kill path: 30-45 minutes.
- Console integration: 45-60 minutes.
- Tests and verification: 30-45 minutes.

## Risks & Mitigation

- Risk: agent process exits before kill is invoked.
  - Mitigation: tolerate `ESRCH`/already-gone process errors and still attempt tmux cleanup.
- Risk: adapter-derived agent lacks `tmuxSession`.
  - Mitigation: fallback to registry lookup by agent name.
- Risk: confirmation input conflicts with chat input.
  - Mitigation: ignore `K` while input focus is active and give dialog input handling priority.

## Resources Needed

- Existing CLI and Ink test patterns.
- `TmuxManager` and `AgentRegistry` utilities from `@ai-devkit/agent-manager`.
