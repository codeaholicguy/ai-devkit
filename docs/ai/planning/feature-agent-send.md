---
phase: planning
title: Agent Send Command - Planning
description: Task breakdown for implementing the agent send command
---

# Agent Send Command - Planning

## Milestones

- [x] Milestone 1: TtyWriter core module in agent-manager
- [x] Milestone 2: CLI `agent send` subcommand
- [x] Milestone 3: Tests and validation

## Task Breakdown

### Phase 1: Core Module

- [x] Task 1.1: Create `TtyWriter` class in `packages/agent-manager/src/terminal/TtyWriter.ts`
  - Static `send(location, message)` method accepting `TerminalLocation`
  - Dispatches to tmux (`send-keys`), iTerm2 (`write text`), or Terminal.app (`keystroke` + `key code 36`)
  - All subprocesses via `execFile` (no shell) to prevent command injection
  - Throws descriptive errors for unsupported terminal types or send failures

- [x] Task 1.2: Export `TtyWriter` from agent-manager package
  - Add to `packages/agent-manager/src/terminal/index.ts`
  - Add to `packages/agent-manager/src/index.ts`

### Phase 2: CLI Command

- [x] Task 2.1: Add `agent send` subcommand in `packages/cli/src/commands/agent.ts`
  - Register `send <message>` command with `--id <identifier>` required option
  - Instantiate `AgentManager`, register adapters, list agents
  - Resolve agent by `--id` using `resolveAgent()`
  - Handle: not found, ambiguous match, no terminal, unsupported terminal
  - Find terminal via `TerminalFocusManager.findTerminal(pid)`
  - Send message via `TtyWriter.send(location, message)`
  - Display success/error feedback

### Phase 3: Tests

- [x] Task 3.1: Unit tests for `TtyWriter`
  - Test tmux send-keys with correct args
  - Test tmux failure handling
  - Test iTerm2 AppleScript via execFile (no shell)
  - Test iTerm2 escaping of `\` and `"`
  - Test iTerm2 session not found
  - Test Terminal.app uses `keystroke` + `key code 36` (not `do script`)
  - Test Terminal.app execFile for shell injection prevention
  - Test Terminal.app tab not found
  - Test unsupported terminal type throws error

- [x] Task 3.2: Unit tests for `agent send` CLI command
  - Test successful send flow
  - Test agent not found
  - Test ambiguous agent match
  - Test non-waiting agent warning
  - Test terminal not found for agent

## Dependencies

- Task 1.2 depends on Task 1.1
- Task 2.1 depends on Task 1.2
- Task 3.1 depends on Task 1.1
- Task 3.2 depends on Task 2.1

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Unsupported terminal type | Medium | High | Clear error message listing supported terminals; recommend tmux as universal fallback |
| Terminal.app keystroke steals focus | Medium | Low | Documented as known limitation; brief focus steal is acceptable |
| Command injection via message content | Low | High | All subprocesses use `execFile` (no shell); AppleScript strings escaped for `\` and `"` |
| Agent has no TTY (background process) | Low | Medium | Check for valid TTY before attempting terminal lookup |
