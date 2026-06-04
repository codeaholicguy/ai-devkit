---
phase: requirements
title: Agent Console Channel Controls Requirements
description: Start and stop Telegram channel daemon bridges from agent console
---

# Agent Console Channel Controls Requirements

## Problem Statement

`ai-devkit agent console` is the primary TUI for monitoring and controlling running agents. Users can already start agents, rename agents, kill agents, open terminals, and send messages from the console, but starting a Telegram channel bridge still requires leaving the console and running `ai-devkit channel start`.

This breaks the console workflow for users who want to attach a selected agent to a configured messaging channel for remote interaction. The bridge already exists and daemon mode is available, but the console does not expose it or show which agents are connected to a channel.

## Goals & Objectives

### Primary Goals
- Pressing `c` in `agent console` opens a channel selector sourced from `~/.ai-devkit/channels.json`.
- Selecting a channel starts a daemon bridge for the currently selected agent.
- Pressing `C` stops the channel currently connected to the selected agent.
- Use the existing daemon command path: `ai-devkit channel start <channel-name> --agent <selected-agent> --daemon` and `ai-devkit channel stop <channel-name>`.
- Show a channel indicator in the agent list when an agent is connected to a live channel bridge.
- Highlight the selected agent preview panel with a green border when that agent is connected to a live channel bridge.
- Show status text in the preview panel that says the agent is connected and identifies the channel.

### Secondary Goals
- Refresh channel bridge state after start/stop actions and during existing console polling.
- Surface start/stop errors in the console without breaking the TUI.
- Keep foreground `channel start` behavior unchanged outside the console.

### Non-Goals
- Adding a new channel type implementation beyond the existing configured channel records.
- Adding a channel configuration wizard to the console.
- Starting foreground channel bridges from the console.
- Supporting multiple concurrent channel daemons from the console UI.
- Changing Telegram connector behavior, bot token storage, or channel bridge registry format unless needed to read status.

## User Stories & Use Cases

- As a developer in `agent console`, I want to press `c` on a selected agent and choose one of my configured channels so that it starts relaying messages to and from that agent in the background.
- As a developer, I want to press `C` so that I can stop the running channel bridge without leaving the console.
- As a developer managing multiple agents, I want a `remote` marker in the agent list so that I can immediately see which agent is connected to a channel.
- As a developer inspecting an agent preview, I want a green connected visual state and explicit channel status so that I can verify the selected agent is remotely reachable.
- As a keyboard user, I want channel shortcuts to respect input ownership so that typing `c` in message or rename/start input fields does not trigger channel actions.

## Key Workflow

1. User opens `ai-devkit agent console`.
2. User selects an agent in the list.
3. User presses `c`.
4. Console reads configured channels from `~/.ai-devkit/channels.json` and shows them in a right-pane selector.
5. User selects a channel.
6. Console shells out through the existing action runner to `channel start <channel-name> --agent <agent-name> --daemon`.
7. On success, console refreshes channel state and marks the selected agent as connected to the selected channel.
8. User can see the connected `remote` marker in the agent list, green preview border, and preview status text.
9. User presses `C`.
10. Console shells out through the existing action runner to `channel stop <connected-channel-name>`.
11. On success, console refreshes channel state and removes the connected indicators.

## Success Criteria

- Footer/help text documents `c channel` and `C stop channel`.
- Pressing `c` while agent list/preview is focused opens a channel selector populated from `~/.ai-devkit/channels.json`.
- Selecting a channel starts the daemon for the selected agent via argv equivalent to `channel start <channel-name> --agent <name> --daemon`.
- Pressing `C` stops the channel connected to the selected agent via argv equivalent to `channel stop <channel-name>`.
- Shortcut handling does not fire while text input panes own keyboard input.
- Live bridge state is read from the existing channel service/registry and stale bridge records are ignored through existing service behavior.
- The agent list shows a compact ASCII `remote` marker only for agents connected to a live bridge.
- The selected connected agent preview panel uses a green border.
- Preview status shows `Connected: <channel-name>`.
- Start/stop success and failure messages are visible in the console.
- Existing `s`, `r`, `K`, `o`, and message shortcuts continue to work.

## Constraints & Assumptions

- The console is built with Ink and React; changes must use existing console action, context, layout, and design-system patterns.
- Console channel start/stop must use daemon mode because foreground bridges are long-lived and would occupy the console.
- Configured channels are stored in `~/.ai-devkit/channels.json` and should be read through `ConfigStore`.
- The TUI must not expose channel secrets such as Telegram bot tokens.
- The bridge registry must not expose Telegram bot tokens or secrets to the TUI.
- Memory search could not be completed during Phase 1 because the local `npx` cache contains a `better-sqlite3` native module compiled for a different Node version.

## Questions & Open Items

- Confirmed: console channel start/stop should run daemon process commands, not foreground bridge commands.
- Confirmed: multiple configured channels are supported; start must let the user select which configured channel to start.
