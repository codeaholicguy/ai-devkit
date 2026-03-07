---
phase: requirements
title: Agent Send Command
description: Send messages/input to a running AI agent that is waiting for user input
---

# Agent Send Command

## Problem Statement

When running multiple AI agents (e.g., Claude Code sessions) across different terminals, users must manually switch to each terminal to provide input when an agent is waiting. This is especially painful when:

- Managing multiple agents in tmux/iTerm2 panes
- An agent is waiting for a simple "continue" or "yes" confirmation
- Users want to script or automate agent interactions

The existing `agent list` command shows waiting agents, and `agent open` can focus a terminal, but there's no way to send input programmatically without switching context.

## Goals & Objectives

**Primary goals:**
- Allow users to send text input to a running agent's terminal via CLI
- Support identifying target agents via `--id` flag (name, slug, or partial match)
- Auto-submit the message via the terminal emulator's native input mechanism (tmux send-keys, AppleScript write text / keystroke)

**Non-goals:**
- Interactive/bidirectional communication with agents
- Streaming agent output back to the sender
- Supporting non-terminal agent interfaces (APIs, sockets)
- Cross-machine agent communication

## User Stories & Use Cases

1. **As a developer managing multiple agents**, I want to send "continue" to a waiting agent without switching terminals, so I can stay focused on my current work.
   - `ai-devkit agent send "continue" --id ai-devkit`

2. **As a developer**, I want to confirm a prompt from an agent quickly.
   - `ai-devkit agent send "yes" --id merry`

3. **As a developer scripting agent workflows**, I want to pipe commands to agents programmatically.
   - `ai-devkit agent send "/commit" --id ai-devkit`

4. **Edge cases:**
   - Agent is not in waiting state (warn but still allow send)
   - Agent ID matches multiple agents (error with disambiguation list)
   - Agent's terminal type is unsupported (clear error message)
   - Agent not found (clear error message)

## Success Criteria

- `ai-devkit agent send "<message>" --id <identifier>` delivers the message as keyboard input to the agent's terminal and submits it
- The command resolves agents by name, slug, or partial match via `--id`
- Clear error messages for: agent not found, ambiguous match, unsupported terminal type, terminal not found
- Works in tmux, iTerm2, and Terminal.app environments
- Message delivery is confirmed with success output

## Constraints & Assumptions

- **Platform**: macOS primary (tmux, iTerm2, Terminal.app), Linux via tmux only
- **Delivery mechanism**: Terminal-native input injection (not TTY device write, which only outputs to display)
- **Supported terminals**: tmux, iTerm2, Terminal.app. Other terminals (Warp, VS Code, Alacritty without tmux) are unsupported.
- **Security**: All subprocess calls use `execFile` (no shell) to prevent command injection
- **Assumes**: The agent process has a valid TTY and runs in a supported terminal emulator
- **Depends on**: Existing `AgentManager`, `AgentAdapter`, `TerminalFocusManager`, and process detection infrastructure

## Questions & Open Items

- ~Agent identification approach~ -> Resolved: explicit `--id` flag only
- ~Delivery mechanism~ -> Resolved: terminal-native input injection (tmux send-keys, AppleScript write text / keystroke). Direct TTY write was rejected — it only writes to terminal display, not input.
- ~Auto-Enter behavior~ -> Resolved: each terminal mechanism handles Enter natively (tmux `Enter`, iTerm2 auto-newline, Terminal.app `key code 36`).
- ~Embedded newlines~ -> Resolved: send message as-is. No splitting or special interpretation.
- ~Command injection risk~ -> Resolved: all subprocess calls use `execFile` (no shell). AppleScript strings escaped for `\` and `"`.
- ~Terminal.app `do script`~ -> Resolved: replaced with System Events `keystroke` + `key code 36`. `do script` runs a new shell command, not input to the foreground process.
