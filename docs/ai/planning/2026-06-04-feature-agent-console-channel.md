---
phase: planning
title: Agent Console Channel Controls Plan
description: Task breakdown for Telegram daemon controls in agent console
---

# Agent Console Channel Controls Plan

## Milestones

- [x] Milestone 1: Console actions and channel status state are wired.
- [x] Milestone 2: Agent list and preview render connected indicators.
- [x] Milestone 3: Shortcut UX, tests, and documentation updates are complete.

## Task Breakdown

### Phase 1: Foundation
- [x] Task 1.1: Add channel start/stop action types.
- [x] Task 1.2: Extend `runAction` argv mapping for `channel start <channel-name> --agent <name> --daemon` and `channel stop <channel-name>`.
- [x] Task 1.3: Add channel status loading/refresh support to console context using `ChannelService.getLiveBridges()`.
- [x] Task 1.4: Add configured-channel loading from `~/.ai-devkit/channels.json` through `ConfigStore`.

### Phase 2: UI Indicators
- [x] Task 2.1: Pass channel status into `AgentListPane` and render connected icon.
- [x] Task 2.2: Pass selected agent channel status into `PreviewPane`.
- [x] Task 2.3: Render green connected preview border and `Connected: <channel-name>` status.

### Phase 3: Shortcuts and Feedback
- [x] Task 3.1: Handle `c` and `C` shortcuts in `ConsoleAppShell` outside text-input modes.
- [x] Task 3.2: Refresh channel status after successful start/stop.
- [x] Task 3.3: Surface start/stop success and error messages.
- [x] Task 3.4: Update footer/help shortcut text.
- [x] Task 3.5: Add right-pane channel selector for configured channels.

### Phase 4: Tests and Verification
- [x] Task 4.1: Add/extend action runner tests for channel actions.
- [x] Task 4.2: Add/extend component tests for agent-list icon and preview connected state.
- [x] Task 4.3: Add/extend shell/context tests for shortcut action dispatch and refresh behavior where practical.
- [x] Task 4.4: Run feature lint, targeted tests, and build/type checks relevant to CLI.

## Implementation Summary

Implemented multi-channel console controls. `c` opens a right-pane selector populated from `~/.ai-devkit/channels.json` through `ConfigStore`; selecting a channel starts `channel start <channel> --agent <selected-agent> --daemon`. `C` stops the channel connected to the selected agent. Connected agents show a channel icon in the agent list, a green preview border, and `Connected: <channel-name>` status text.

## Dependencies

- Existing `channel start --daemon` and `channel stop` implementation.
- Existing `ChannelService.getLiveBridges()` stale-state handling.
- Existing console action runner and Ink component test patterns.

## Timeline & Estimates

- Phase 1: 1-2 hours.
- Phase 2: 1-2 hours.
- Phase 3: 1-2 hours.
- Phase 4: 1-2 hours.

## Risks & Mitigation

- Risk: Channel service reads user-global state during tests. Mitigation: mock `ChannelService` or inject a service instance.
- Risk: Uppercase `C` collides with text input. Mitigation: preserve existing focus/mode guards before shortcut handling.
- Risk: Green border token does not exist. Mitigation: use the existing success/accent token if available, otherwise add a minimal token-consistent value.
- Risk: Multiple configured Telegram channels. Mitigation: v1 uses the explicit default name `telegram`; future work can add selection.

## Resources Needed

- Existing CLI/TUI code and Jest test setup.
- Existing channel daemon docs and service implementation.
- Optional real Telegram bot credentials for manual end-to-end validation.
