---
phase: implementation
title: Session Reconciliation Implementation
description: Implemented registry, manager, migration, and kill changes
---

# Session Reconciliation Implementation

## Changed components

- `005_interactive_agent_soft_delete.sql`: adds forensic deletion state and the
  `(type, session_id)` lookup index.
- `DatabaseConnection`: exposes better-sqlite3's immediate transaction mode.
- `AgentRegistry.reconcile`: restores session matches, migrates PIDs, preserves
  managed metadata, suffixes new names, soft-deletes missing rows, and returns
  active entries in detection order.
- `AgentManager.listAgents`: passes only successful adapter types to reconciliation;
  thrown types are untouched and successful empty types are reconciled empty.
- Pinning: rejects soft-deleted rows without probing process liveness.
- Kill: exact registry fallback makes soft-deleted names killable. Soft-deleted
  rows skip PID signaling because that PID may have been recycled, but still
  clean tmux and hard-delete the exact registry row.

## Incident correction

The original sandbox trigger remains the evidence chain, but observer deletion
is now reversible instead of forbidden. A blind Codex sandbox marks rows with
`deleted_at`; a later full observation finds the same session IDs, clears the
timestamp, migrates current PIDs, and restores names, pins, and tmux mappings.

No interactive code calls `process.kill(pid, 0)`. The unrelated channel-daemon
service retains its own liveness behavior.

Security review found and fixed one PID-reuse hazard: explicit cleanup of a
soft-deleted row never signals its stored PID, which may now belong to another
process. SQL remains parameterized and reconcile rollback is transaction-bound.
