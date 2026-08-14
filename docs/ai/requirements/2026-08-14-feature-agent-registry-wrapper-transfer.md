---
phase: requirements
title: Agent Registry Wrapper Transfer Requirements
description: Prevent live wrapper-to-child transitions from violating unique agent names
---

# Agent Registry Wrapper Transfer Requirements

## Problem

Gemini CLI runs a Node wrapper and child process. Detection returns the child PID while carrying the wrapper's registry name. If the live wrapper row still owns that name, `AgentManager.listAgents()` writes the child row and SQLite rejects it with `UNIQUE constraint failed: agents.name`.

## Goals

- Let batch discovery transfer a registry name between PIDs of the same agent type.
- Preserve the wrapper's managed name, tmux session, and original start time.
- Use the detected child's PID and current session metadata.
- Handle transitions both before and after a child fallback row is cached.
- Keep explicit single-entry registration and cross-type name conflicts strict.
- Reject duplicate names first introduced by separate entries in the same discovery batch.

## Success Criteria

- Both wrapper-to-child orderings complete atomically with one target-PID row.
- `agent list` no longer fails during the reproduced Gemini transition.
- Existing registry, manager, adapter, and CLI tests remain green.

## Constraints

- Keep the public `AgentRegistry` API unchanged.
- Do not add adapter-specific registry writes.
- Keep all deletes and insertion within the existing SQLite batch transaction.
