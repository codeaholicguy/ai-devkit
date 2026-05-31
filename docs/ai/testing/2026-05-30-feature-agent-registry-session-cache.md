---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals

- Unit coverage for every new/changed code path in `AgentRegistry`, `AgentManager`, `CodexAdapter`, `GeminiCliAdapter`.
- Behavior parity: cache-hit path produces an `AgentInfo` shape equivalent to the miss path.
- No new tests for `ClaudeCodeAdapter` or `OpenCodeAdapter` — both unchanged.

## Unit Tests

### `AgentRegistry` (`src/__tests__/utils/AgentRegistry.test.ts`)

- [x] `register` persists `sessionId` and `sessionFilePath`.
- [x] `register` preserves existing non-empty `tmuxSession` when incoming is empty.
- [x] `register` replaces `tmuxSession` when incoming is non-empty.
- [x] `registerBatch([])` is a no-op (no file created).
- [x] `registerBatch(N)` performs a single `writeFileSync` call.
- [x] `registerBatch` applies `tmuxSession` merge per entry.

### `AgentManager.listAgents` (`src/__tests__/AgentManager.test.ts`)

- [x] Persists every detected agent to the registry (one entry per pid, correct shape).
- [x] Prunes entries whose pids are dead within the same `listAgents` call.
- [x] Preserves an existing name (e.g. user-set `"merry"`) across cycles.
- [x] Preserves an existing `tmuxSession` and `startedAt` across cycles.
- [x] Writes a fresh `startedAt` for new entries.
- [x] Issues exactly one `registerBatch` call per `listAgents` (across all adapters).
- [x] Skips `registerBatch` when no agents detected but still calls `prune`.

### `CodexAdapter.detectAgents` cache short-circuit (`src/__tests__/adapters/CodexAdapter.test.ts`)

- [x] Hit: short-circuits matching when registry has a valid entry; `matchProcessesToSessions` and `batchGetSessionFileBirthtimes` not called.
- [x] Miss (no entry): falls through to existing pipeline.
- [x] Type mismatch (`entry.type !== 'codex'`): falls through.
- [x] Missing session file (`!existsSync(sessionFilePath)`): falls through.

### `GeminiCliAdapter.detectAgents` cache short-circuit (`src/__tests__/adapters/GeminiCliAdapter.test.ts`)

Same four scenarios as Codex.

## Test Reporting & Coverage

```
agent-manager: 359/359 passed
cli:           627/628 passed (1 pre-existing failure unrelated to this feature)
```

Run with:
```
npm test -w packages/agent-manager
npm test -w packages/cli
```

## Manual Testing

- [x] Delete `~/.ai-devkit/agents.json`, run `ai-devkit agent list` twice — second call hits the cache, output identical.
- [x] Kill a running agent process between two list calls — its entry is pruned on the second call.
- [x] Edit `tmuxSession` for an existing entry by hand in the JSON file, run `ai-devkit agent list` — value preserved (merge rule).

## Performance

Cache hit savings (rough, depends on history depth):

| Adapter | Saving | Why |
|---|---|---|
| Codex   | 20–100ms | skip day-bucket walk |
| Gemini  | 50–300ms | skip chats-dir walk + per-file reads |
| Claude  | n/a | no short-circuit (PID-file already O(1)) |
| OpenCode | n/a | no short-circuit (SQLite already fast) |

Overhead per `listAgents`: 1 atomic registry write + 1 `prune` sweep (~few ms).
