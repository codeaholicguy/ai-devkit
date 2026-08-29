---
phase: design
title: Observer-Never-Deletes Registry Design
description: Minimal design for durable registry ownership
---

# Observer-Never-Deletes Registry Design

## Ownership rule

`AgentManager.listAgents()` detects and displays live agents but cannot know
authoritatively that an absent PID is dead: ai-devkit did not necessarily start
the process, and callers may run in another PID namespace. Therefore refresh,
registration, rename conflict resolution, and pin validation never delete rows.
Only the explicit `agent kill` workflow calls `AgentRegistry.remove(type, pid)`.

## Refresh reconciliation

For each detected agent, take the pre-refresh registry snapshot and compare exact
`(type, pid)` identity:

- Stored session ID empty or equal: inherit the held name and metadata, register
  the observation, and display the persisted values.
- Stored session ID different: treat the PID as recycled. Generate the first
  available suffix (`name-2`, `name-3`, ...), display it without registering it,
  and leave the held row untouched.
- No exact row: register the detected agent normally.

Display-only handling is required for the mismatched-session case because the
SQLite primary key is `(type, pid)`; writing it would overwrite the held row.
Collision takeover is deferred, so a detector never acquires a held name.

## Data boundaries

No schema changes are required. The `agents` table remains distinct from
`durable_agents`; durable-agent lifecycle code is not involved. `isAlive`
remains available only for user-facing validation and reporting.
