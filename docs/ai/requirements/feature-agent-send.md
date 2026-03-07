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
- Auto-append Enter (newline) so the message is submitted immediately

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
   - Agent's TTY is not writable (clear error message)
   - Agent not found (clear error message)

## Success Criteria

- `ai-devkit agent send "<message>" --id <identifier>` delivers the message + `\r` (carriage return) to the correct agent's TTY, triggering submit in raw-mode CLIs
- The command resolves agents by name, slug, or partial match via `--id`
- Clear error messages for: agent not found, ambiguous match, TTY not writable
- Works in tmux, iTerm2, and Terminal.app environments
- Message delivery is confirmed with success output

## Constraints & Assumptions

- **Platform**: macOS primary (TTY write via `/dev/ttysXXX`), Linux secondary
- **Permissions**: Requires write access to the target TTY device
- **Delivery mechanism**: Direct TTY write (writing to `/dev/ttysXXX`)
- **Assumes**: The agent process has a valid TTY (not a background/daemon process)
- **Depends on**: Existing `AgentManager`, `AgentAdapter`, and process detection infrastructure

## Questions & Open Items

- ~Agent identification approach~ -> Resolved: explicit `--id` flag only
- ~Delivery mechanism~ -> Resolved: TTY write
- ~Auto-Enter behavior~ -> Resolved: always auto-append `\r` (carriage return). Raw-mode terminals (like Claude Code) use CR as Enter, not LF.
- ~Embedded newlines~ -> Resolved: send message as-is (single TTY write), append `\r` at end. No splitting or special interpretation.
