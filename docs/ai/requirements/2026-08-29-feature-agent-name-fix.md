---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

Interactive agents started in managed tmux sessions lose their custom registry
name and tmux link. A refresh inside a provider sandbox cannot see host PIDs,
prunes the managed rows as dead, and a later host refresh recreates them from
provider session mappings with generated names and an empty `tmux_session`.
Consequently `agent kill` can terminate a provider process without removing its
managed tmux session. A genuine provider PID rollover has the same metadata-loss
outcome because registry continuity currently uses only `(type, pid)`.

## Goals & Objectives
**What do we want to achieve?**

- Keep a managed registry row while its tmux session exists, even if PID probing
  reports `ESRCH` from an isolated namespace.
- Preserve managed identity across a genuine PID rollover when provider session
  identity is stable.
- Ensure kill captures and cleans the managed tmux session when the provider is
  already gone or a refresh would otherwise discard the mapping.
- Keep unmanaged detected rows prunable and preserve current stale-name conflict
  behavior.
- Non-goals: rebuilding the process detector, changing durable-agent lifecycle,
  restoring already-lost names, or automatically deleting unrelated orphan tmux
  sessions.

## User Stories & Use Cases
**How will users interact with the solution?**

- As an agent operator, I want names and tmux links to survive refreshes from
  sandboxed workers so registry commands remain trustworthy.
- As an agent operator, I want a restarted provider process to retain the managed
  session identity when it resumes the same provider session.
- As an agent operator, I want `agent kill <custom-name>` to remove the managed
  tmux session even if the provider process has already exited.
- Unmanaged detected agents remain PID-scoped and are pruned when dead.

## Success Criteria
**How will we know when we're done?**

- An `ESRCH` probe does not prune a row with non-empty `tmux_session` while
  `tmux has-session` confirms that session exists.
- The same row is pruned once both provider PID and tmux session are absent.
- A detected `(type, sessionId)` match migrates managed metadata atomically to a
  new PID without leaving duplicate rows.
- Refresh output retains the custom name and kill removes the captured tmux
  session even when process termination returns `ESRCH`.
- `durable_agents` behavior and schema remain unchanged.

## Constraints & Assumptions
**What limitations do we need to work within?**

- Registry APIs are synchronous; tmux liveness probing must therefore use a
  synchronous, argument-safe process call or an injectable synchronous probe.
- Only non-empty managed tmux links receive the tmux-liveness exception.
- Provider session IDs are scoped by agent type and ignored when empty or
  synthetic PID identifiers.
- SQLite updates must be transactional and preserve pins and start metadata.

## Questions & Open Items
**What do we still need to clarify?**

- None. The user approved prune safety, session-ID continuity, and pre-refresh
  kill capture after live validation of the two-stage trigger.
