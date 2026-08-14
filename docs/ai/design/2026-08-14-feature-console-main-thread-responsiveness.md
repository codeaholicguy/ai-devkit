---
phase: design
title: Shared Asynchronous Process Snapshot
description: One enriched process snapshot per AgentManager refresh
---

# System Design & Architecture

## Architecture Overview

```mermaid
flowchart LR
    Console[Ink console polling] --> Manager[AgentManager.listAgents]
    Manager --> Snapshot[captureProcessSnapshot]
    Snapshot --> PS[async ps once]
    Snapshot --> Enrich[async batched cwd/start enrichment]
    Manager --> F1[filter by adapter processNames]
    Manager --> F2[filter by adapter processNames]
    F1 --> A1[adapter canHandle/session mapping]
    F2 --> A2[adapter canHandle/session mapping]
    Snapshot --> Manager
```

`AgentManager` gathers the optional executable-name hints advertised by snapshot-aware adapters and requests one enriched union snapshot. Before dispatch, it slices that snapshot by each adapter's declared argv[0] executable names. Each adapter then applies its existing `canHandle` logic before session discovery. This preserves the pre-snapshot candidate pools for broad Node-entrypoint matchers such as Pi and Gemini without repeating process scans.

## Data Models and API

- `AgentDetectionContext.processes`: a read-only, adapter-scoped array of enriched `ProcessInfo` records from one capture.
- `AgentAdapter.processNames?`: executable basenames needed by that adapter (`node` included for Gemini and Pi).
- `AgentAdapter.detectAgents(context?)`: optional context preserves source compatibility for existing implementations and direct calls.
- `captureProcessSnapshot(names)`: async utility that performs one `ps` listing, filters relevant basenames, then asynchronously enriches the union of candidate PIDs.
- `filterByProcessNames(processes, names)`: shared argv[0] filter used by capture, manager dispatch, and defensive adapter boundaries, including Windows separator and `.exe` normalization.

## Design Decisions

- Chosen: optional adapter hints plus an optional detection context. This avoids enriching every OS process and preserves legacy third-party adapters.
- Rejected: capture/enrich all OS processes. It is simpler at the interface but can create oversized `lsof`/`ps -p` arguments and unnecessary work.
- Rejected: async scans inside every adapter. It frees the event loop but retains repeated scans and does not satisfy one-snapshot-per-refresh semantics.
- Chosen: manager-owned executable-name slicing based only on the adapter's declared `processNames`. This restores historical input pools without coupling the manager to tool-specific token matching.
- Rejected: passing the full union to every adapter. Pi and Gemini intentionally inspect argv[1..], so foreign agents with `pi` or `gemini` path arguments become false positives.

## Failure and Compatibility Behavior

- Snapshot command failures resolve to an empty snapshot, matching prior discovery helpers.
- Enrichment is best-effort and preserves empty `cwd`/missing `startTime` per PID.
- `lsof` failure uses asynchronous per-PID `pwdx` fallback on platforms where available.
- Snapshot-aware built-ins use a local async snapshot when invoked without manager context.
- Built-ins defensively scope hand-built contexts to their declared executable names before applying `canHandle`.
- Adapters without `processNames` receive no context and keep their historical behavior.

## Non-Functional Requirements

- No `execFileSync` on the built-in multi-adapter refresh path.
- Exactly one base `ps -axo` capture per manager refresh with snapshot-aware adapters.
- No polling or Ink rendering configuration changes.
