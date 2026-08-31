---
phase: requirements
title: Reversible Interactive Agent Reconciliation
description: Requirements for session identity and forensic soft deletion
---

# Reversible Interactive Agent Reconciliation

## Incident evidence

Managed agents lost their custom names and tmux mappings while retaining their
original, live host PIDs. At `2026-08-29T08:10:16Z`, an FTS agent ran
`npx ai-devkit agent list --json` inside a Codex exec sandbox. Host PIDs were
invisible there, so the old list-time liveness prune hard-deleted the rows. A
later host observation rediscovered the original PIDs from Codex session data
and recreated default folder-PID names with empty `tmux_session` values.

## Required behavior

- Interactive identity is exactly `(type, AgentInfo.sessionId)`, including
  provider `pid-*` fallback IDs.
- Every detection cycle reconciles all successful adapter results in one
  `BEGIN IMMEDIATE` SQLite transaction.
- Matching sessions restore soft-deleted rows and migrate PID while preserving
  name, pin, tmux link, start time, and managed metadata.
- New sessions receive suffix-unique generated names.
- Missing sessions and recycled-PID occupants are soft-deleted with a forensic
  `deleted_at` timestamp, never hard-deleted by observation.
- A successful empty adapter result soft-deletes that type. A thrown adapter is
  skipped because failure supplies no state information.
- List output contains detected/restored agents only.
- Explicit `agent kill` is the only hard-delete operation and supports live and
  soft-deleted rows.
- No process-liveness probe exists in the interactive registry path.
- `durable_agents` remains unchanged.

## Success criteria

Blind sandbox observation is reversible: full detection restores every session's
name, pin, tmux mapping, and other durable metadata. Transaction failure leaves
no partial reconciliation state.
