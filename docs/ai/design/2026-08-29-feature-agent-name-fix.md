---
phase: design
title: Bound-Session Reconciliation Design
description: Immediate-transaction reconciliation without schema changes
---

# Bound-Session Reconciliation Design

`AgentRegistry.reconcile` filters out null and empty detected session IDs, then
runs one `BEGIN IMMEDIATE` transaction. For each remaining detection it first
finds `(type, session_id)`, otherwise inspects `(type, pid)`: an empty-session PID
row binds in place, a different bound occupant is deleted, and an empty slot gets
a fresh suffix-unique insert. Matching rows update only PID, cwd, session file,
and update time. Managed metadata remains unchanged.

After processing detections, rows with non-empty session IDs are deleted when
their successful adapter type did not report them. Empty-session rows are excluded
from cleanup. A thrown adapter contributes no successful type and therefore causes
no deletion for that type; a successful empty result deletes every bound row for it.

The existing `(type,pid)` primary key and schema version 4 remain unchanged. No
index, column, surrogate key, liveness probe, or scheduled pruning is introduced.
`BEGIN IMMEDIATE` protects the read-then-write sequence from deferred lock-upgrade
failures under multi-process access.
