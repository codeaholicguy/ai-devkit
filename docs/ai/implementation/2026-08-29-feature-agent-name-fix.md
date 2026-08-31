---
phase: implementation
title: Bound-Session Reconciliation Implementation
description: Registry, manager, and kill behavior
---

# Bound-Session Reconciliation Implementation

- `AgentRegistry.reconcile` performs one immediate transaction and returns only
  detected agents with non-empty session IDs.
- Session matches preserve managed metadata across PID rollover.
- Empty-session same-PID start rows bind in place; no other placeholder is special.
- Bound PID reuse deletes the occupant and inserts a fresh detected row.
- Cleanup deletes only missing bound rows belonging to successful adapter types.
- `AgentManager.listAgents` treats adapter exceptions as absence of information.
- Interactive refresh and pinning contain no process-liveness calls.
- The command-level kill lookup remains because empty-session start rows are skipped
  by detection and must still be addressable by their custom registry name.
- Database schema and migrations remain at version 4; durable agents are unchanged.

The original incident came from observer-relative PID visibility. The final design
accepts destructive blind observation for bound rows while keeping unbound management
records under explicit start/kill ownership.
