---
phase: requirements
title: Agent Registry Names Must Survive Observation
description: Incident requirements and acceptance criteria
---

# Agent Registry Names Must Survive Observation

## Incident and evidence chain

Managed agents initially retained their custom names and tmux links. Their SQLite
rows later contained the original, still-live host PIDs but generated names and
empty `tmux_session` values. This disproved PID rollover as the incident trigger.

Manager forensics identified the destructive observation: at
`2026-08-29T08:10:16Z`, an FTS agent ran `npx ai-devkit agent list --json` inside
its Codex exec sandbox. Host PIDs were absent from that PID namespace, so
`process.kill(pid, 0)` returned `ESRCH`; list-time pruning deleted the rows. A
later host refresh rediscovered the same original PIDs through Codex session
metadata and registered generated folder-PID names with no tmux mapping.

## Required behavior

- Refresh/list is an observer and never deletes registry rows.
- Registration conflict handling never deletes a row based on process liveness.
- Pinning a dead or namespace-invisible agent throws `AgentNotRunningError` but
  preserves its row.
- `agent kill` is the only interactive-agent row deletion path, including when
  the target process already exited.
- Detection inherits a name only for an exact `(type, pid)` match whose stored
  session ID is empty or equals the detected session ID.
- A recycled PID with a different session ID receives a display-only unique
  suffix; it neither inherits nor overwrites the held row.
- Undetected registry rows remain hidden from `agent list` output.
- `durable_agents` is separate and unchanged.

## Deferred work

PID-rollover session continuity, tmux-guarded liveness, kill-order changes, and
name-collision takeover are explicitly out of scope.
