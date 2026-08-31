---
phase: requirements
title: Interactive Agent Session Reconciliation
description: Requirements for destructive, session-identity reconciliation
---

# Interactive Agent Session Reconciliation

## Incident evidence

Managed agents lost custom names and tmux mappings while retaining their original,
live host PIDs. At `2026-08-29T08:10:16Z`, an FTS agent ran
`npx ai-devkit agent list --json` inside a Codex exec sandbox. Host PIDs were
invisible there, so the old list-time liveness prune deleted the rows. A later
host observation rediscovered the original PIDs from Codex session data and
recreated default folder-PID names with empty `tmux_session` values.

## Required behavior

- Interactive identity is `(type, AgentInfo.sessionId)`, including `pid-*` fallback IDs.
- Each detection cycle reconciles successful adapter results in one `BEGIN IMMEDIATE` transaction.
- Matching sessions migrate PID and refresh detection fields while preserving managed metadata.
- A same-PID unbound row (`''` or `pid-*`) adopts the first bound session identity.
- A bound different-session PID occupant and rows absent from successful detection are deleted.
- New sessions receive suffix-unique generated names.
- A thrown adapter type is skipped; successful empty results delete that type's rows.
- List output contains detected agents only; no process-liveness probe is used.
- Explicit kill deletes the exact row and retains a registry fallback for adapter failures.
- `durable_agents` remains unchanged.

## Accepted consequence

A blind-context `agent list` can hard-delete interactive rows, and later full detection recreates them with default metadata.

Atomic failure must leave no partial reconciliation state.
