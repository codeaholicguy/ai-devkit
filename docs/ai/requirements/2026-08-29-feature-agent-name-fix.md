---
phase: requirements
title: Interactive Agent Registry Reconciliation
description: Final requirements for bound detection and start-row ownership
---

# Interactive Agent Registry Reconciliation

## Incident evidence

Managed agents lost custom names and tmux mappings while retaining their original,
live host PIDs. At `2026-08-29T08:10:16Z`, an FTS agent ran
`npx ai-devkit agent list --json` inside a Codex exec sandbox. Host PIDs were
invisible there, so list-time liveness pruning deleted valid rows. Later detection
recreated default folder-PID names with empty tmux mappings.

## Final behavior

- No interactive path probes PID liveness or deletes based on liveness.
- Every detection cycle reconciles once in a `BEGIN IMMEDIATE` transaction.
- Null or empty detected session IDs are ignored completely.
- `(type, session_id)` matches refresh PID, cwd, session file, and timestamp only.
- A same-PID row with an empty session ID binds to the first detected non-empty ID,
  preserving its custom name, tmux mapping, pin, and start time.
- A same-PID row with a different non-empty ID is deleted and replaced without metadata inheritance.
- New detected rows use the adapter name with numeric suffixes for name collisions.
- Successful adapter output deletes undetected bound rows; adapter exceptions skip that type.
- Empty-session rows are never reconciled or deleted by observation.
- Kill retains registry-name fallback so skipped start rows remain killable.
- No schema or migration changes are required; `durable_agents` is untouched.

Adapter output is truth for bound rows. Empty-session rows are management records
owned by start and kill. Blind-observer deletion of bound metadata is accepted.
