---
phase: requirements
title: harness-port-cutover requirements
description: I12 — daemon-primary cutover + efficiency report
---

# I12: cutover + efficiency report

## In scope

- Every `AgentManager` consumer goes through `fetchEnrichedAgents`
  (daemon `agent.list`) — `channel-runner.ts` was the last
  local-only callsite.
- With all ten types ported, `portedTypes` covers the whole adapter
  set: a reachable daemon means zero local `detectAgents` work; an
  unreachable daemon degrades to the full local path (capability
  kept, preference flipped).
- Readiness cutover landed in I11 (`status` daemon-primary).
- Publish the per-iteration metrics table (LOC, fixtures, parity
  defects, daemon overhead, latency).

## Out of scope

- Removing the local adapter path — it remains the fallback.
- `getConversation`/`findSessionsById` etc. (epic-level out-of-scope).
