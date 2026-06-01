---
phase: requirements
title: Agent Console Kill
description: Add confirmed kill support to the interactive agent console
---

# Requirements & Problem Understanding

## Problem Statement

Developers can monitor, open, and message agents from `ai-devkit agent console`, but cannot stop a selected agent from the same interface. Stopping a managed agent currently requires leaving the console and using external process or tmux commands. This is slower and risks leaving the managed tmux session behind.

## Goals & Objectives

- Add a keyboard-driven kill action to `agent console`.
- Use uppercase `K` for kill so lowercase `k` remains upward navigation.
- Show a confirmation pop-up before killing the selected agent.
- Stop the selected agent process.
- If the selected agent has a non-empty `tmuxSession`, kill that tmux session as part of the same action.
- Refresh console state after a successful kill so the stopped agent disappears once discovery/registry pruning observes it.

## Non-Goals

- Do not change lowercase `j/k` navigation.
- Do not add bulk kill support.
- Do not add force/timeout tuning in this feature.
- Do not expose kill for historical sessions.

## User Stories & Use Cases

- As a developer using `agent console`, I want to press `K` on the selected agent and confirm the action so I can stop the agent without leaving the console.
- As a developer using managed tmux agents, I want the tmux session cleaned up when the agent is killed so that no detached tmux session remains.
- As a developer, I want accidental `K` presses to be reversible at the confirmation prompt.

## Success Criteria

- Pressing lowercase `k` still moves the selection up.
- Pressing uppercase `K` with a selected agent opens a confirmation pop-up.
- Confirming the pop-up invokes a kill action for the selected agent.
- Cancelling the pop-up leaves the agent and tmux session untouched.
- The kill action sends a termination signal to the agent PID.
- The kill action kills `tmuxSession` when the selected agent has one.
- The console footer documents `K kill`.
- Errors are shown as transient console errors rather than crashing the TUI.

## Constraints & Assumptions

- The console is an Ink TUI; the confirmation should be implemented with existing Ink components, not an external terminal prompt.
- Existing console actions are subprocess-based through `runAction`; kill should follow the same pattern so the TUI keeps control of the terminal.
- `tmuxSession` is available from `AgentInfo` for registry-backed managed agents.
- A regular `SIGTERM` is the default process stop signal for this feature.
- Memory search was unavailable due to a local `better-sqlite3` Node ABI mismatch, so this scope is based on existing repo docs/code and user clarification.

## Questions & Open Items

- Resolved: shortcut is uppercase `K`, not lowercase `k`.
