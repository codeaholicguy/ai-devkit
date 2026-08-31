---
phase: design
title: Session-Identity Reconciliation Design
description: Atomic hard-delete reconciliation architecture
---

# Session-Identity Reconciliation Design

Successful adapter output is authoritative for that observer. Within one
`BEGIN IMMEDIATE` transaction, reconciliation matches indexed `(type, session_id)`
identities, migrates matching rows to detected PIDs, adopts an unbound same-PID
start row, deletes bound PID conflicts, inserts suffix-unique new rows, and deletes
rows missing from successful adapter types. Adapter exceptions skip their type.

Migration `005_interactive_agent_identity.sql` is additive and creates only:

```sql
CREATE INDEX idx_agents_identity ON agents(type, session_id);
```

The existing `(type,pid)` primary key remains. `BEGIN IMMEDIATE` is required for
the read-then-write algorithm under multi-process concurrency: a deferred
transaction's lock upgrade can return `BUSY` without honoring the configured busy
handler. Existing ordinary transaction callers remain, so both helpers are kept.

Identity adoption bridges agent start to first provider detection: if session lookup
misses and the same PID row has `session_id = ''` or a `pid-*` placeholder, its
identity is updated while name, tmux mapping, pin, and start time remain intact.
Only a bound different session is displaced, by deletion. `durable_agents` is untouched.
