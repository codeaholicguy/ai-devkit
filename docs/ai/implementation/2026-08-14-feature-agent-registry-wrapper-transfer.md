---
phase: implementation
title: Agent Registry Wrapper Transfer Implementation
description: Implementation notes for batch identity handoff in AgentRegistry
---

# Agent Registry Wrapper Transfer Implementation

## Changed Files

- `packages/agent-manager/src/utils/AgentRegistry.ts`
  - Keeps `register()` on the normal same-PID merge path.
  - Resolves a same-name, same-type transfer source during `registerBatch()`.
  - Snapshots transfer candidates before iteration so new batch rows cannot become transfer sources.
  - Deletes the source and any target fallback before saving the merged child row.
  - Assigns incoming type and PID when merging entries across identities.
- `packages/agent-manager/src/__tests__/utils/AgentRegistry.test.ts`
  - Covers direct transfer, transfer over a cached child fallback, and same-batch duplicate rejection.

## Behavior

The registry remains the single writer during list refresh. Wrapper-aware adapters can return the child PID with the wrapper's name, and the registry completes the handoff without adapter-side persistence or public API changes.

## Edge Cases

- Existing child fallback: removed before insertion so the wrapper start time is retained.
- Cross-type owner: not transferred.
- Same-batch duplicate: rejected and rolled back.
- Single registration: does not claim another live PID's name.
