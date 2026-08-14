---
phase: design
title: Agent Console Fast Initial State Design
description: Synchronous cached identity snapshot with console stale-while-revalidate state
---

# Agent Console Fast Initial State Design

## Data Flow

```mermaid
flowchart LR
    Registry[(AgentRegistry)] -->|sync live-PID identities| Snapshot[AgentManager.getCachedAgentSnapshot]
    Snapshot -->|first render: unknown + cached| Console[useAgentList]
    Console -->|async| Discovery[AgentManager.listAgents]
    Discovery -->|one state update| Console
    Console -->|live rows, cache markers cleared| UI[Agent list + footer]
```

## API Decision

Add `AgentManager.getCachedAgentSnapshot(): CachedAgentSnapshot[]`. The snapshot contains identity and registry metadata only: registered name, type, PID, cwd, start time, session ID, and optional session path. It filters out dead PIDs and types without a registered adapter and never invokes adapter discovery.

The alternative of returning `AgentInfo[]` was rejected because the registry cannot defensibly populate live `status`, `summary`, or `lastActive`. The console adapts snapshots into temporary `AgentInfo` placeholders with `status: unknown`, an empty summary, and explicit cached metadata kept separately in `cachedAgentPids`.

## Reconciliation and Errors

- `useState` uses a lazy synchronous initializer, so the first render cannot await discovery.
- The existing effect immediately calls `listAgents({ sortBy: 'status' })` and keeps the 3000 ms interval and in-flight guard unchanged.
- Successful discovery replaces the entire cached array and clears `cachedAgentPids` in one state update, including an empty result.
- A rejected refresh retains cached rows, clears the refreshing flag, and exposes the error.
- Existing name-based selection remains selected when the registered name survives live reconciliation; otherwise the existing selection effect chooses the first live row or clears selection.

## Merge/Overlap Risk

`feature-console-main-thread-responsiveness` may also edit `useAgentList.ts`, `ConsoleApp.tsx`, or `ConsoleContext.tsx`. Prefer merging this branch first because it adds the snapshot initialization and two state fields while leaving discovery/polling mechanics intact. If the responsiveness branch lands first, resolve overlap by preserving its scheduling/off-main-thread changes and reapplying only the lazy cached initializer plus atomic cache-marker clearing. Do not reintroduce adapter discovery on the render path.
