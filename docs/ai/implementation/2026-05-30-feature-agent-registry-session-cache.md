---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Code Structure

| File | Role |
|---|---|
| `packages/agent-manager/src/utils/AgentRegistry.ts` | `RegistryEntry` shape + read/write/upsert/prune/list. Adds `sessionId` + `sessionFilePath` fields, `registerBatch`, `tmuxSession` merge rule. |
| `packages/agent-manager/src/AgentManager.ts` | Sole writer during `listAgents`. Builds `RegistryEntry[]` via `toRegistryEntry`, calls `registerBatch` once, then `prune` once. |
| `packages/agent-manager/src/adapters/CodexAdapter.ts` | Optional `registry` constructor arg. `tryRegistryCache` short-circuits the day-bucket walk on a hit. |
| `packages/agent-manager/src/adapters/GeminiCliAdapter.ts` | Same pattern as Codex; short-circuits the chats-dir walk + per-file reads. |
| `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts` | Unchanged — `~/.claude/sessions/<pid>.json` is already O(1). |
| `packages/agent-manager/src/adapters/OpenCodeAdapter.ts` | Unchanged — SQLite lookup is already O(1). |
| `packages/cli/src/services/agent/agent.service.ts` | `startAgent` writes new entries with `sessionId: ''` / `sessionFilePath: ''`; the next `listAgents` fills them in. |

## Key Implementation Notes

### Single-writer during `listAgents`

Parallel adapter detection (`Promise.all`) reads from the registry but never writes. After aggregation, the manager builds the full `RegistryEntry[]`, calls `registerBatch` once, then `prune` once. This eliminates the read-modify-write race that per-adapter writes would have caused.

External callers (`agent.service.startAgent`) may still call `register()` between `listAgents` calls; cross-process safety is provided by atomic `tmp + rename`.

### `toRegistryEntry` preserves identity, refreshes activity

```ts
toRegistryEntry(agent, existing) → {
    name:            existing?.name        ?? agent.name,
    type:            agent.type,
    pid:             agent.pid,
    tmuxSession:     existing?.tmuxSession ?? '',
    cwd:             agent.projectPath,
    startedAt:       existing?.startedAt   ?? new Date().toISOString(),
    sessionId:       agent.sessionId,
    sessionFilePath: agent.sessionFilePath ?? '',
}
```

User-set `name`, `tmuxSession`, and `startedAt` survive across cycles. Everything else mirrors the live process.

### Upsert merge rule (`AgentRegistry.mergeEntry`)

Only `tmuxSession` has a merge rule: preserve existing non-empty when incoming is empty. All other fields replace. The rule lives at the registry layer so external `register()` callers also benefit; identity preservation (name / startedAt) lives at the manager layer because only the manager has the "this entry was here before" context.

### Adapter cache short-circuit (Codex / Gemini)

```ts
private tryRegistryCache(processes) {
    const byPid = new Map(this.registry.list().map(e => [e.pid, e]));
    for (const proc of processes) {
        const entry = byPid.get(proc.pid);
        if (!entry || entry.type !== this.type ||
            !entry.sessionFilePath || !fs.existsSync(entry.sessionFilePath)) {
            remaining.push(proc); continue;
        }
        const session = this.parseSession(safeReadFile(entry.sessionFilePath), entry.sessionFilePath);
        if (!session) { remaining.push(proc); continue; }
        cachedAgents.push(this.mapSessionToAgent(session, proc, entry.sessionFilePath));
    }
    return { cachedAgents, remaining };
}
```

Read the registry once per call (one `list()`), build a `Map<pid, entry>`, then loop. Guards fall through cleanly:

- no entry → run normal pipeline
- wrong type (cross-type pid reuse from a previous run) → run normal pipeline
- empty `sessionFilePath` → run normal pipeline
- session file deleted on disk → run normal pipeline
- parser couldn't read the file → run normal pipeline

### Why Claude and OpenCode don't read the registry

Claude has `~/.claude/sessions/<pid>.json` — a per-pid file that Claude Code writes on startup. Reading it is one `fs.readFileSync` keyed by pid; the registry cache would save ~5–10 ms at best and add a hit-path branch + extra read for `pidStatus`/`waitingFor` parity. OpenCode resolves sessions through SQLite — already O(ms). Neither benefits from caching, so both stay as-is.

Both still get written through to the registry by the manager so the "one entry per live agent" contract holds across all adapter types.

## Error Handling

- `AgentRegistry.readFile()` swallows any parse / I/O failure and returns `{ entries: [] }`. Cache misses, not crashes.
- `tryRegistryCache` treats every failure (no entry, missing file, parser returned null) as a fall-through to the existing matching pipeline.
- `AgentManager.listAgents()` catches per-adapter `detectAgents()` failures (existing behavior) so one broken adapter doesn't poison the whole listing or the registry write.

## Performance

| Adapter | Hit-path saving (est.) |
|---|---|
| Codex   | 20–100ms (skip day-bucket walk) |
| Gemini  | 50–300ms (skip chats-dir walk + per-file reads) |
| Claude  | n/a (PID file already O(1)) |
| OpenCode| n/a (SQLite already O(1)) |

Added cost per `listAgents()`: one atomic file write (~few ms) + one `prune` sweep (~ms).

## Security

- Registry file lives at `~/.ai-devkit/agents.json` — same path and trust boundary as before.
- No new data classes persisted; the added `sessionId` and `sessionFilePath` fields point at files already on disk.
- Atomic `tmp + rename` writes prevent torn files for concurrent readers.
