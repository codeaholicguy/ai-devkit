---
phase: implementation
title: Shared Process Snapshot Implementation
description: Implementation record for asynchronous agent discovery
---

# Implementation Guide

## Status

Implemented after focused tests failed for the intended missing snapshot behavior.

## Intended Code Structure

- `utils/process.ts`: asynchronous capture, parsing, filtering, and enrichment.
- `adapters/AgentAdapter.ts`: optional discovery context and process-name hints.
- `AgentManager.ts`: one shared snapshot per refresh and legacy adapter compatibility.
- Built-in adapters: filter the provided snapshot or asynchronously capture one for direct calls.

## Compatibility and Error Handling

Keep current synchronous exports intact for external callers. Async discovery resolves command failures to empty/partial data. Adapter exceptions remain isolated by `AgentManager`.

## Design Deviations

None.

## Alignment Review

The implementation matches the requirements and reviewed design: one manager-owned async union snapshot, manager-owned executable slicing, adapter-owned command matching, async direct-call fallback, preserved legacy adapters, unchanged registry/sorting/error boundaries, and no console polling or rendering-option changes.

## Changed Files and Decisions

- `utils/process.ts` exposes callback-based async capture and enrichment plus shared executable normalization/filtering while retaining sync compatibility exports. Async commands use an explicit 10 MiB buffer and no unsupported `stdio` option.
- `AgentAdapter` accepts an optional read-only detection context and optional executable hints.
- `AgentManager` captures one union snapshot and passes each snapshot-aware adapter only the argv[0] slice declared by its `processNames`.
- All seven built-in adapters defensively scope provided contexts, preserve their `canHandle` narrowing, support Windows command paths, and use async standalone capture when called directly.
- Adapter fixtures retain their existing behavior assertions through a compatibility-shim mock of standalone capture; manager-path behavior is tested separately against the real union-and-slice contract.
