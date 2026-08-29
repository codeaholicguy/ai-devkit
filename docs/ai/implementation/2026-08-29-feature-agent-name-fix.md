---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup

- Worktree: `.worktrees/feature-agent-name-fix`
- Bootstrap: `npm ci && npm run build`
- Runtime evidence: Node 24.18.0, npm 11.16.0, CLI 0.56.0, Linux/tmux.

## Code Structure
**How is the code organized?**

- Registry: `packages/agent-manager/src/utils/AgentRegistry.ts`
- Refresh reconciliation: `packages/agent-manager/src/AgentManager.ts`
- Kill orchestration: `packages/cli/src/services/agent/agent.service.ts` and
  `packages/cli/src/commands/agent.ts`
- Tests remain beside existing agent-manager and CLI suites.

## Implementation Notes
**Key technical details to remember:**

### Core Features
- `AgentRegistry.isAlive` now consults exact tmux-session liveness only after an
  `ESRCH` result for a managed row. Missing sessions permit pruning; probe errors
  preserve state.
- Detection batches opt into stable-session continuity. Only unique, non-empty,
  non-synthetic `(type, sessionId)` matches migrate managed metadata, and the
  old/new PID change occurs in the existing SQLite transaction.
- `agent kill` captures an exact registry entry before refresh, follows its PID
  or unique stable session to the detected process, and passes the captured tmux
  mapping to kill orchestration.

### Patterns & Best Practices
- Dependency-inject external liveness checks for deterministic tests.
- Match strongest identity first and fail closed on ambiguity.
- Preserve synchronous registry semantics and transactional writes.

## Integration Points
**How do pieces connect?**

- SQLite is accessed through the existing `DatabaseConnection`.
- Tmux checks reuse argument-safe process execution and the current
  `TmuxManager` abstraction where asynchronous orchestration permits it.

## Error Handling
**How do we handle failures?**

- Only `ESRCH` is definitive PID absence. A live managed tmux session overrides
  that absence for pruning purposes.
- Unexpected process or tmux probe failures preserve registry state.
- Kill ignores `ESRCH` from process termination but still cleans captured tmux.

## Performance Considerations
**How do we keep it fast?**

- Tmux is queried only for managed entries after a definitive dead-PID result.
- Registry snapshots and migrations remain batched.

## Security Notes
**What security measures are in place?**

- Session names already pass CLI validation; process execution must not use a
  shell. No credentials or user content are added to registry state.

## Evidence

- Sandboxed `agent list`: original rows present before, `[]` returned, rows empty
  afterward because outer PIDs were absent from sandbox `/proc`.
- Unsandboxed `agent list`: original PIDs rediscovered and rows recreated with
  generated names and empty `tmux_session`.
- Controlled current-code reproduction: stable session ID under a new PID lost
  custom name and tmux metadata and replaced the old row.
- TDD red: prune, continuity, kill-service, and kill-command regressions each
  failed against the old production implementation.
- Regression reversal repeated the four failures after implementation, followed
  by four passing tests after restoration.
- Post-fix sandbox smoke: an invisible PID row remained registered while
  `tmux has-session -t =memory-search-brainstorm` returned success.
- Repository gates: build, six-project tests, lint, and 41 e2e tests passed.
- Security review found no command-injection, SQL-injection, privilege-boundary,
  or destructive-target findings: tmux uses an array-based API with an exact
  target, SQL remains parameterized, and ambiguous session matches fail closed.
