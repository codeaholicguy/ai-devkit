---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

`AgentManager.listAgents()` currently asks every adapter to rediscover its session from disk on every call (Codex/Gemini scan day-bucket directories; Claude reads a PID file and may fall back to a CWD/birthtime walk). Meanwhile `AgentRegistry` at `~/.ai-devkit/agents.json` only contains entries that a caller explicitly registered, so it is not a reliable source of truth for "what's currently running."

The registry has not been released, so its on-disk shape can change freely.

## Goals & Objectives

### Primary goals

1. **Registry mirrors live processes.** After every `AgentManager.listAgents()`, `AgentRegistry` contains one entry for each currently-active agent (across Claude, Codex, Gemini, OpenCode). Dead pids are removed in the same flow.
2. **Pid → session lookup.** Each entry stores `{ pid, sessionId, sessionFilePath, ... }`. `listAgents()` lists live processes, then looks up session info in the registry by pid instead of re-running the per-adapter discovery walk.

### Non-goals

- **Caching mutable session content.** `summary`, `status`, `lastActive` are re-derived from the JSONL/DB on every call. The registry stores only the (pid → sessionId, sessionFilePath) mapping plus identity fields.
- **PID-recycle defense.** Recycle within the same agent type + same cwd between two `listAgents()` calls is rare; defer until it materially bites.
- **Schema versioning / migration.** Registry unreleased.
- **`lookupBySessionId`.** No caller in v1.

## User Stories & Use Cases

- As a CLI user listing agents from a TUI that polls frequently, I want Codex and Gemini detection to skip the per-call directory walk so polling stays cheap regardless of how many historical sessions are on disk.
- As an integrator inspecting active agents programmatically, I want `~/.ai-devkit/agents.json` to be an accurate reflection of "what's running right now."

### Edge cases

- **Process exited between detects.** `AgentManager.listAgents()` prunes dead pids in the same flow.
- **Session file deleted between detects.** Hit-path verifies `fs.existsSync(entry.sessionFilePath)`; absence forces fall-through to the per-adapter discovery pipeline.
- **First call after install / cleared registry.** No cache hits; every adapter runs its discovery pipeline and writes entries back. Subsequent calls hit cache.
- **Two adapters detect the same pid.** Not possible in practice — `canHandle()` keys on the executable name.

## Success Criteria

### Functional

- After any `listAgents()` call, `registry.list()` returns exactly the set of currently-active agents.
- Dead pids removed before `listAgents()` returns.
- On a registry hit, the adapter reads `sessionFilePath` directly and skips its discovery walk.
- On a miss (or missing file), the adapter falls through to its existing pipeline and writes the result back.

### Quality

- Unit tests cover hit, miss, and missing-session-file paths for Claude/Codex/Gemini.
- Behavior parity: same `AgentInfo[]` shape on hit vs miss.
- `lint --feature agent-registry-session-cache` passes; full test suite green.
- Manual verification: delete `~/.ai-devkit/agents.json`, run `ai-devkit agents ls` twice, confirm second call has the cache populated and identical output.

## Constraints & Assumptions

### Technical

- `RegistryEntry` shape: `{ name, type, pid, tmuxSession, cwd, startedAt, sessionId, sessionFilePath }`. No `processStartedAtMs`, no version field.
- `registerBatch(entries: RegistryEntry[]): void` — single read + single write for many entries. `register()` delegates to `registerBatch([entry])`.
- Upsert key is `name`. `generateAgentName(cwd, pid)` embeds pid, so distinct pids produce distinct names; one-entry-per-pid invariant follows.
- On upsert, `tmuxSession` is merged: preserve existing non-empty when incoming is empty string. Other fields replace.
- `AgentManager` is the single writer. After all adapters detect in parallel, `AgentManager.listAgents()` batches the writes and calls `prune()` once.
- Each cache-using adapter's `detectAgents()` accepts an optional `AgentRegistry` and short-circuits by looking up pids in `registry.list()` before its discovery walk.
- OpenCode does not consult the cache (SQLite lookup is already fast) but its entries are still written through to the registry so the contract holds.

### Assumptions

- Atomic `tmp + rename` writes handle concurrent CLI processes safely; last-writer-wins is acceptable.
- `AgentRegistry.default()` singleton is shared across adapters and the manager.

## Questions & Open Items

None — design choices below match the compact intent: "the agent registry will store info of all the active agent (live process); whenever agent manager run list agent, it will list process, then from the pid, get the session path/id from the agent registry; the pid recycle is rare and we can skip for now."
