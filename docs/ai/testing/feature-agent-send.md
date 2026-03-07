---
phase: testing
title: Agent Send Command - Testing
description: Testing strategy for the agent send feature
---

# Agent Send Command - Testing

## Test Strategy

Unit tests for both the core `TtyWriter` module and the CLI command integration.

## Test Cases

### TtyWriter Unit Tests (`agent-manager`)
- tmux: sends message via `tmux send-keys` with correct args
- tmux: throws on tmux failure
- iTerm2: sends via `osascript` with `execFile` (not `exec`/shell)
- iTerm2: escapes `\` and `"` in message
- iTerm2: throws when session not found
- Terminal.app: sends via System Events `keystroke` + `key code 36` (NOT `do script`)
- Terminal.app: uses `execFile` to prevent shell injection
- Terminal.app: throws when tab not found
- Unknown terminal: throws descriptive error

### CLI `agent send` Tests (`cli`)
- Sends message successfully to a resolved agent
- Errors when no agent matches the given ID
- Handles ambiguous agent match (multiple matches)
- Warns when agent is not in waiting state but still sends
- Errors when terminal cannot be found for agent

## Coverage Results

- **agent-manager**: 63 tests, all passing (9 TtyWriter-specific)
- **cli**: 361 tests, all passing (5 agent send-specific)

## Coverage Target

100% line coverage for `TtyWriter.ts` and the `send` command handler.
