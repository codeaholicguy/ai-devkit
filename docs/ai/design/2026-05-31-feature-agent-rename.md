---
phase: design
title: System Design & Architecture
description: Define the technical architecture, components, and data models
---

# System Design & Architecture

## Architecture Overview

```mermaid
graph TD
    CLI["CLI: agent rename <current> <new>"]
    Validate["Validate new name (NAME_REGEX)"]
    Registry["AgentRegistry.rename(current, new)"]
    FS["~/.ai-devkit/agents.json (atomic write)"]

    CLI --> Validate
    Validate -->|valid| Registry
    Validate -->|invalid| ErrFormat["Error: invalid name format"]
    Registry -->|current not found| ErrNotFound["Error: agent not found"]
    Registry -->|new name in use (live)| ErrConflict["Error: name already in use"]
    Registry -->|success| FS
    FS --> Success["ui.success: renamed"]
```

## Data Models

`RegistryEntry` (existing, unchanged):
```ts
interface RegistryEntry {
    name: string;        // ← this field is updated
    type: AgentType;
    pid: number;
    tmuxSession: string; // ← NOT updated (registry-only rename)
    cwd: string;
    startedAt: string;
    sessionId: string;
    sessionFilePath: string;
}
```

## API Design

### `AgentRegistry.rename(currentName: string, newName: string): void`

Added to `packages/agent-manager/src/utils/AgentRegistry.ts`.

Behaviour:
1. Read the registry file.
2. Find entry with `name === currentName`. If not found, throw `RenameNotFoundError`.
3. Prune stale entries before conflict check.
4. Check whether any remaining entry has `name === newName`. If found and alive, throw `RenameConflictError`.
5. Update the matched entry's `name` to `newName`. Write atomically.

Two new error classes (in `AgentRegistry.ts`):
```ts
export class RenameNotFoundError extends Error {
    constructor(public agentName: string) { ... }
}
export class RenameConflictError extends Error {
    constructor(public agentName: string) { ... }
}
```

### CLI: `agent rename <current-name> <new-name>`

Added in `registerAgentCommand()` in `packages/cli/src/commands/agent.ts`.

```
ai-devkit agent rename <current-name> <new-name>
```

Validation order:
1. Validate `<new-name>` against `NAME_REGEX` → exit 1 with format hint.
2. Short-circuit if `<current-name> === <new-name>` → success no-op message.
3. Call `AgentRegistry.default().rename(currentName, newName)`.
4. Catch `RenameNotFoundError` → `ui.error` + exit 1.
5. Catch `RenameConflictError` → `ui.error` + exit 1.
6. On success → `ui.success("Agent \"<old>\" renamed to \"<new>\".")`.

## Component Breakdown

| Component | File | Change |
|-----------|------|--------|
| `AgentRegistry` | `packages/agent-manager/src/utils/AgentRegistry.ts` | Add `rename()`, `RenameNotFoundError`, `RenameConflictError` |
| `agent.ts` CLI | `packages/cli/src/commands/agent.ts` | Add `agent rename` subcommand |
| `index.ts` (agent-manager) | `packages/agent-manager/src/index.ts` | Export new error classes |

## Design Decisions

**Registry-only rename (no tmux session rename):** Per user decision. Simpler implementation, no dependency on a live tmux session. The `tmuxSession` field retains the original session name, so `tmux attach -t <original>` still works.

**Prune before conflict check:** Matches the pattern used in `startAgent`. Prevents a stale dead entry from blocking a valid rename.

**Same-name short-circuit in CLI (not registry):** Keeps `AgentRegistry.rename()` a simple mutation primitive; the no-op guard is a CLI-layer concern.

**Error classes on `AgentRegistry`:** Mirrors `AgentNameInUseError` / `AgentPidPollTimeoutError` pattern in `agent.service.ts`. CLI catches them for user-friendly messages.

## Non-Functional Requirements

- Atomic write: use existing `.tmp` + `renameSync` pattern. No data loss on crash mid-write.
- No new runtime dependencies.
