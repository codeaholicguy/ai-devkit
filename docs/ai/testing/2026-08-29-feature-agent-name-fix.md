---
phase: testing
title: Agent Registry Name Fix Testing
description: Regression coverage and gate evidence
---

# Agent Registry Name Fix Testing

## TDD regressions

- [x] A refresh blind to an existing PID displays no agent but preserves the
  registry name and tmux link.
- [x] Pinning a dead PID throws `AgentNotRunningError` and preserves the row.
- [x] Killing an already-dead PID cleans tmux and removes the row.
- [x] Detection of a recycled PID with a different session ID gets the first
  available suffixed name while the old row remains untouched.
- [x] Existing detection-based `agent list` display behavior remains unchanged.

The revised tests failed against the prior destructive implementation and pass
with the minimal fix. Targeted evidence: agent-manager 85/85 and CLI 108/108.

## Repository gates

- [x] Build: all six projects passed.
- [x] Full tests: all six projects passed (1,082 CLI, 624 agent-manager,
  115 channel-connector, 112 task-manager, 110 memory, 22 dashboard).
- [x] Lint: all six projects passed with four pre-existing warnings and no errors.
- [x] E2E: 41/41 passed.

All results above come from fresh commands in the feature worktree.
