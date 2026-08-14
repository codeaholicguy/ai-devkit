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

The implementation matches the requirements and design: one manager-owned async snapshot, adapter-owned filtering, async direct-call fallback, preserved legacy adapters, unchanged registry/sorting/error boundaries, and no console polling or rendering-option changes.

## Changed Files and Decisions

- `utils/process.ts` now exposes callback-based async capture and enrichment while retaining sync compatibility exports.
- `AgentAdapter` accepts an optional read-only detection context and optional executable hints.
- `AgentManager` captures one union snapshot and passes the same context to snapshot-aware adapters.
- All seven built-in adapters filter the shared context and use async standalone capture when called directly.
- Adapter fixtures retain their existing behavior assertions through a mocked async snapshot boundary.
