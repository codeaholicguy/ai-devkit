---
phase: design
title: Agent Registry Wrapper Transfer Design
description: Atomically reconcile same-type name ownership during discovery batches
---

# Agent Registry Wrapper Transfer Design

## Design

`registerBatch()` treats an incoming row whose name is owned by another PID of the same agent type as an identity transfer. It merges from the old name owner, assigns the incoming type and PID, deletes the old identity and any existing target-PID fallback, then saves the merged row in the same transaction.

Transfer candidates are snapshotted before processing the batch. A duplicate name introduced by two incoming rows is therefore not mistaken for a wrapper handoff and still rolls back the batch with a uniqueness error.

The merge preserves the old name, tmux session, and start time while preferring non-empty incoming cwd and session fields.

## Safety Boundary

- Transfer is available only through `registerBatch()`, the live-discovery write path.
- `register()` retains ordinary same-identity merge and unique-name enforcement.
- A name owned by another agent type is not transferable and remains a constraint error.
- A name created earlier in the same batch is not transferable.

## Components

- `AgentRegistry.mergeEntry()` must assign incoming identity fields when merging across PIDs.
- `AgentRegistry.registerBatch()` detects and applies transfers atomically.
- Registry unit tests cover transfers with and without a pre-existing child row.
