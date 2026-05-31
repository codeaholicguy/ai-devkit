---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Tasks

### Registry

- [ ] Extend `RegistryEntry` with `sessionId: string` and `sessionFilePath: string`.
- [ ] Add `AgentRegistry.registerBatch(entries: RegistryEntry[]): void` — single read, in-memory upsert per entry, single atomic write. `register()` delegates to `registerBatch([entry])`.
- [ ] `tmuxSession` merge rule on upsert: preserve existing non-empty when incoming is empty string; replace all other fields.
- [ ] Unit tests: `register`/`registerBatch` upsert with new fields, `tmuxSession` merge, `registerBatch` performs a single write for N entries.

### Manager (single writer)

- [ ] In `AgentManager.listAgents()`, after adapter aggregation and before name overlay + sort:
  - Build `RegistryEntry[]` from `allAgents` via a private `toRegistryEntry(agent, existing?)` helper that preserves `existing.name`, `existing.tmuxSession`, and `existing.startedAt` when present.
  - Call `this.registry.registerBatch(entries)` once when entries is non-empty.
  - Call `this.registry.prune()` once.
- [ ] Unit tests: `registerBatch` invoked once per `listAgents()`; `prune()` invoked once per `listAgents()`; `tmuxSession` and `startedAt` preserved across cycles when prior entry had values; new sessions get fresh `startedAt`.

### Adapter base wiring

- [ ] Add optional `registry: AgentRegistry` constructor arg to Codex and Gemini adapters, defaulting to `AgentRegistry.default()`. Claude and OpenCode unchanged.
- [ ] Confirm factory / CLI call sites work unchanged.

### ClaudeCodeAdapter

- [ ] No change. PID-file lookup (`~/.claude/sessions/<pid>.json`) is already O(1) and authoritative.

### CodexAdapter

- [ ] Same partition pattern. Cached procs skip the day-bucket walk.
- [ ] No registry writes.
- [ ] Unit tests mirroring Claude's (no PID-file parity test).

### GeminiCliAdapter

- [ ] Same partition pattern. Cached procs skip the chats-dir walk + per-file reads.
- [ ] No registry writes.
- [ ] Unit tests mirroring Claude's (no PID-file parity test).

### OpenCodeAdapter

- [ ] No change.

### Verification

- [ ] `npm test -w packages/agent-manager` green.
- [ ] Manual: delete `~/.ai-devkit/agents.json`, run `ai-devkit agents ls` twice. Confirm second call has cache entries and identical output. Repeat with Codex and Gemini if those agents are available locally.
- [ ] Manual: kill an agent between two `agents ls` calls; confirm its entry disappears after the second call (prune).
- [ ] Manual: set `tmuxSession` on an existing entry by hand; run `agents ls`; confirm value preserved (merge rule).

## Dependencies

- Registry changes land first.
- Manager + adapter changes can land together (adapters only read from the registry, never write).
- Adapter changes are independent of each other.

## Risks

- **Risk:** Concurrent `ai-devkit agents ls` from different shells race on the write. **Mitigation:** Atomic `tmp + rename`; last-writer-wins acceptable.
- **Risk:** Pid reuse within the same agent type + same cwd between two listings. **Mitigation:** Accepted (compact intent: "the pid recycle is rare and we can skip for now"). Cross-type reuse is rejected by the `entry.type === this.agentType` guard.
