---
phase: testing
title: Agent Send Command - Testing
description: Testing strategy for the agent send feature
---

# Agent Send Command - Testing

## Test Strategy

Unit tests for both the core `TtyWriter` module and the CLI command integration.

## Test Cases

### TtyWriter Unit Tests
- Writes message + newline to TTY device file
- Writes message without newline when `appendNewline=false`
- Throws error when TTY device does not exist
- Throws error when TTY device is not writable

### CLI `agent send` Tests
- Sends message successfully to a resolved agent
- Errors when `--id` flag is missing
- Errors when no agent matches the given ID
- Handles ambiguous agent match (multiple matches)
- Errors when agent has no valid TTY

## Coverage Target

100% line coverage for `TtyWriter.ts` and the `send` command handler.
