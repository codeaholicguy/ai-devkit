---
phase: planning
title: Agent Send Command - Planning
description: Task breakdown for implementing the agent send command
---

# Agent Send Command - Planning

## Milestones

- [ ] Milestone 1: TtyWriter core module in agent-manager
- [ ] Milestone 2: CLI `agent send` subcommand
- [ ] Milestone 3: Tests and validation

## Task Breakdown

### Phase 1: Core Module

- [ ] Task 1.1: Create `TtyWriter` class in `packages/agent-manager/src/terminal/TtyWriter.ts`
  - Static `send(tty, message, appendNewline)` method
  - Validate TTY exists (`/dev/${tty}`) and is writable
  - Write message + optional newline to TTY device file
  - Throw descriptive errors on failure

- [ ] Task 1.2: Export `TtyWriter` from agent-manager package
  - Add to `packages/agent-manager/src/terminal/index.ts`
  - Add to `packages/agent-manager/src/index.ts`

### Phase 2: CLI Command

- [ ] Task 2.1: Add `agent send` subcommand in `packages/cli/src/commands/agent.ts`
  - Register `send <message>` command with `--id <identifier>` required option
  - Instantiate `AgentManager`, register adapters, list agents
  - Resolve agent by `--id` using `resolveAgent()`
  - Handle: not found, ambiguous match, no TTY
  - Get TTY via `getProcessTty(pid)`
  - Send message via `TtyWriter.send()`
  - Display success/error feedback

### Phase 3: Tests

- [ ] Task 3.1: Unit tests for `TtyWriter`
  - Test successful TTY write
  - Test TTY not found error
  - Test TTY not writable error
  - Test newline append behavior

- [ ] Task 3.2: Unit tests for `agent send` CLI command
  - Test successful send flow
  - Test agent not found
  - Test ambiguous agent match
  - Test missing required args

## Dependencies

- Task 1.2 depends on Task 1.1
- Task 2.1 depends on Task 1.2
- Task 3.1 depends on Task 1.1
- Task 3.2 depends on Task 2.1

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TTY write permission denied | Medium | High | Clear error message; document permission requirements |
| TTY path differs across platforms | Low | Medium | Use `/dev/${tty}` convention; test on macOS and Linux |
| Agent has no TTY (background process) | Low | Medium | Check for valid TTY before attempting write |
