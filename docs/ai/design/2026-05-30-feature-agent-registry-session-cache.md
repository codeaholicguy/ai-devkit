---
phase: design
title: System Design & Architecture
description: Define the technical architecture, components, and data models
---

# System Design & Architecture

## Architecture Overview

`AgentRegistry` becomes the authoritative source for "what's running." `AgentManager.listAgents()` is the **single writer** to the registry: after all adapters finish detecting, the manager converts every `AgentInfo` into a `RegistryEntry`, calls `registerBatch()` once, then `prune()` once. Adapters with expensive matching pipelines (Claude, Codex, Gemini) read from the registry first (`lookupByPid`) to short-circuit session discovery. Adapters never write to the registry.

```mermaid
graph TD
    CLI[CLI / TUI] -->|listAgents| Manager[AgentManager]

    Manager -->|detectAgents (parallel)| Claude[ClaudeCodeAdapter]
    Manager -->|detectAgents (parallel)| Codex[CodexAdapter]
    Manager -->|detectAgents (parallel)| Gemini[GeminiCliAdapter]
    Manager -->|detectAgents (parallel)| OpenCode[OpenCodeAdapter]

    Claude -->|lookupByPid (read)| Registry[(AgentRegistry<br/>~/.ai-devkit/agents.json)]
    Codex -->|lookupByPid (read)| Registry
    Gemini -->|lookupByPid (read)| Registry

    Registry -->|hit| HitPath[Parse cached sessionFilePath]
    Registry -->|miss| MissPath[Existing matching pipeline]

    HitPath --> Build[AgentInfo<br/>+ processStartedAtMs]
    MissPath --> Build
    OpenCode --> Build

    Build --> Aggregate[Manager aggregates AgentInfo from all adapters]
    Aggregate -->|toRegistryEntry per agent| Convert[RegistryEntry array]
    Convert -->|registerBatch ONCE| Registry
    Registry -->|prune ONCE| Registry
    Manager -->|name overlay + sort| CLI
```

### Adapter responsibilities

| Adapter | Reads `lookupByPid` | Writes registry | Notes |
|---|---|---|---|
| ClaudeCodeAdapter | yes | **no — manager writes** | Hit path re-reads `~/.claude/sessions/<pid>.json` for `pidStatus`/`waitingFor` parity |
| CodexAdapter | yes | **no — manager writes** | Hit path skips day-bucket walk |
| GeminiCliAdapter | yes | **no — manager writes** | Hit path skips chats-dir walk + per-file reads |
| OpenCodeAdapter | no | **no — manager writes** | No short-circuit; populates `AgentInfo.processStartedAtMs` like everyone else |

**Single-writer invariant:** Only `AgentManager.listAgents()` writes to `AgentRegistry`. Adapters running in parallel (`Promise.all`) can't race on read-modify-write because they don't write. Their reads from `lookupByPid` use the file as it existed at adapter-start; if a write from a prior `listAgents()` is in flight, atomic `tmp + rename` ensures readers see either the old or new file but never a torn write.

## Data Models

### `AgentInfo` (modified)

```ts
export interface AgentInfo {
    name: string;
    type: AgentType;
    status: AgentStatus;
    summary: string;
    pid: number;
    projectPath: string;
    sessionId: string;
    lastActive: Date;
    sessionFilePath?: string;
    processStartedAtMs: number;  // NEW — required; epoch ms from ProcessInfo.startTime
}
```

Every adapter's mapping function (`mapSessionToAgent`, `mapProcessOnlyAgent`, equivalents in Codex/Gemini/OpenCode) populates this from `proc.startTime!.getTime()`. The field is required because the manager needs it to build `RegistryEntry`; an optional field would force a fallback path with no real "no start time" case.

### `RegistryEntry` (modified)

```ts
export interface RegistryEntry {
    name: string;
    type: AgentType;
    pid: number;
    tmuxSession: string;            // existing — empty string when auto-upserted
    cwd: string;
    startedAt: string;              // existing — ISO 8601, user-facing
    processStartedAtMs: number;     // NEW — epoch ms, matches proc.startTime.getTime()
    sessionId: string;              // NEW — session identifier (UUID for Claude, file path stem for Codex/Gemini, DB id for OpenCode)
    sessionFilePath: string;        // NEW — absolute path to session file (or empty string for OpenCode if irrelevant)
}

interface RegistryFile {
    entries: RegistryEntry[];
}
```

### On-disk example

```jsonc
{
  "entries": [
    {
      "name": "ai-devkit-41203",
      "type": "claude",
      "pid": 41203,
      "tmuxSession": "",
      "cwd": "/Users/hoangnguyen/Codeaholicguy/Code/ai-devkit",
      "startedAt": "2026-05-30T09:14:22.000Z",
      "processStartedAtMs": 1748597662000,
      "sessionId": "a7c4e2f1-9d3b-4e8a-b1c0-2f8e7d9a5c3b",
      "sessionFilePath": "/Users/hoangnguyen/.claude/projects/-Users-hoangnguyen-Codeaholicguy-Code-ai-devkit/a7c4e2f1-9d3b-4e8a-b1c0-2f8e7d9a5c3b.jsonl"
    }
  ]
}
```

### Field rationale

| Field | Why |
|---|---|
| `processStartedAtMs` (number) | Matches `ProcessInfo.startTime.getTime()` and Claude's PID file `startedAt`. Avoids re-parsing ISO string per staleness check. |
| `startedAt` (ISO string) | Kept for user-facing display (CLI output). |
| `sessionId` | Per-adapter identifier. Generic enough for UUIDs, paths, and DB ids. |
| `sessionFilePath` | Cached so hit path skips re-deriving the encoded project-dir path. Empty for OpenCode where the concept doesn't apply. |
| `tmuxSession` | Required at type level (existing). Auto-upserted entries pass empty string. Future tmux integration can update it via `register()`. |

## API Design

### `AgentRegistry` — additions

```ts
class AgentRegistry {
    // existing — unchanged signatures, modified upsert semantics (see below)
    register(entry: RegistryEntry): void;
    lookup(name: string): RegistryEntry | null;
    list(): RegistryEntry[];
    prune(): void;
    isAlive(entry: RegistryEntry): boolean;

    // NEW
    lookupByPid(pid: number, procStartTime: Date): RegistryEntry | null;
    registerBatch(entries: RegistryEntry[]): void;  // single read + single write
}
```

### `register()` / `registerBatch()` upsert semantics

For each incoming entry, upsert by `name`. If an existing entry exists:

- All fields **replace**, except:
- `tmuxSession` is preserved when existing is non-empty and incoming is empty string. This protects user-set or future-tmux-integration values from being clobbered by adapter auto-upserts that don't have tmux context.

`registerBatch` is the preferred path for adapter integration: one read of the registry file, apply the merge for each entry in memory, one atomic write. Avoids O(N) writes per `detectAgents()`.

### `lookupByPid` contract

1. Scan `entries[]` for a match on `pid`.
2. If found, check `Math.abs(procStartTime.getTime() - entry.processStartedAtMs) <= PID_FILE_STALENESS_MS` (60s).
3. Return entry on pass, `null` on fail.

Staleness check is internal — callers cannot accidentally skip it.

### Per-adapter pattern (Claude / Codex / Gemini) — read-only

```ts
async detectAgents(): Promise<AgentInfo[]> {
    const processes = enrichProcesses(listAgentProcesses(this.executable));
    const cached: Array<{ proc: ProcessInfo; entry: RegistryEntry }> = [];
    const uncached: ProcessInfo[] = [];

    for (const proc of processes) {
        if (!proc.startTime) { uncached.push(proc); continue; }
        const entry = this.registry.lookupByPid(proc.pid, proc.startTime);
        if (entry && fs.existsSync(entry.sessionFilePath)) {
            cached.push({ proc, entry });
        } else {
            uncached.push(proc);
        }
    }

    const agents: AgentInfo[] = [];

    // Cache hit: parse the known session file directly
    for (const { proc, entry } of cached) {
        const session = this.parser.readSession(entry.sessionFilePath, /*…*/);
        if (!session) { uncached.push(proc); continue; }
        agents.push(this.buildAgentInfoFromHit(proc, entry, session));
    }

    // Cache miss: existing pipeline
    for (const proc of uncached) {
        const match = this.matchProcess(proc);
        if (!match) { agents.push(this.processOnlyAgent(proc)); continue; }
        agents.push(this.buildAgentInfoFromMatch(proc, match));
    }

    return agents;
}
```

Every `AgentInfo` produced above carries `processStartedAtMs` (populated by `buildAgentInfoFromHit` / `buildAgentInfoFromMatch` / `processOnlyAgent` from `proc.startTime!.getTime()`). No `registry.register` calls inside the adapter.

### `AgentManager.listAgents()` — single writer

```ts
async listAgents(options?): Promise<AgentInfo[]> {
    // Existing: run adapters in parallel, aggregate AgentInfo[]
    const allAgents = await this.runAdaptersInParallel();

    // NEW: persist cache + prune
    const entries = allAgents.map(toRegistryEntry);
    if (entries.length > 0) this.registry.registerBatch(entries);
    this.registry.prune();

    // Existing: name overlay + sort
    return this.applyNameOverlayAndSort(allAgents, options);
}

function toRegistryEntry(agent: AgentInfo): RegistryEntry {
    return {
        name: agent.name,
        type: agent.type,
        pid: agent.pid,
        tmuxSession: '',                       // merge rule in registerBatch preserves existing non-empty
        cwd: agent.projectPath,
        startedAt: new Date(agent.processStartedAtMs).toISOString(),
        processStartedAtMs: agent.processStartedAtMs,
        sessionId: agent.sessionId,
        sessionFilePath: agent.sessionFilePath ?? '',
    };
}
```

**Ordering:** `registerBatch` before `prune`. `registerBatch` writes the fresh entries for live agents; `prune` then walks all entries (fresh + leftover from previous runs) and removes any whose pid is dead. Live agents we just registered survive prune trivially.

### Claude hit-path parity note

Claude's miss path reads `~/.claude/sessions/<pid>.json` for `pidStatus`/`waitingFor` (authoritative live status). Hit path must do the same to keep `AgentInfo.status` consistent:

```ts
const pidEntry = this.readMatchingPidFile(proc.pid, proc.startTime); // 1 file read
// pass pidStatus + waitingFor into mapSessionToAgent
```

This is a single small JSON read; preserves correctness without re-running the full matching pipeline.

## Component Breakdown

### Modified files

| File | Change |
|---|---|
| `packages/agent-manager/src/adapters/AgentAdapter.ts` | Add `processStartedAtMs: number` to `AgentInfo` |
| `packages/agent-manager/src/utils/AgentRegistry.ts` | Extend `RegistryEntry` with 3 fields; add `lookupByPid` + `registerBatch`; export `PID_FILE_STALENESS_MS`; merge rule in upsert |
| `packages/agent-manager/src/AgentManager.ts` | After adapter aggregation, build `RegistryEntry[]` from `AgentInfo[]` via `toRegistryEntry`, call `registerBatch` once, then `prune` |
| `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts` | Constructor takes optional `registry`. Pre-pipeline cache check via `lookupByPid`. Hit-path PID-file re-read. Populate `processStartedAtMs` on every `AgentInfo`. **No `register` calls** |
| `packages/agent-manager/src/adapters/CodexAdapter.ts` | Constructor takes optional `registry`. Pre-pipeline cache check. Populate `processStartedAtMs`. No `register` calls |
| `packages/agent-manager/src/adapters/GeminiCliAdapter.ts` | Constructor takes optional `registry`. Pre-pipeline cache check. Populate `processStartedAtMs`. No `register` calls |
| `packages/agent-manager/src/adapters/OpenCodeAdapter.ts` | Populate `processStartedAtMs` on every `AgentInfo`. No registry interaction (manager handles write) |

### New / extracted utility

`PID_FILE_STALENESS_MS` moves from a private constant in `ClaudeCodeAdapter.ts` to an exported constant in `AgentRegistry.ts` (or a shared `constants.ts`). Single source of truth.

### Unchanged

- `Parser.readSession`, `matchProcessesToSessions`, `enrichProcesses`, `listAgentProcesses`.
- Existing `register/lookup/list/prune` signatures and semantics.
- Other utilities and tests not directly exercising the modified paths.

## Design Decisions

### 1. Cache match only, never content

`summary`, `status`, `lastActive` mutate every prompt. The cache stores only (pid → sessionId, sessionFilePath); content is always re-derived.

### 2. Merge cache into `RegistryEntry`, not a separate section

Per earlier alignment ("keep it simple"). The named-vs-auto distinction collapses: every detected proc upserts. `list()` returning all entries is fine because `prune()` bounds the file by live processes, and existing consumers tolerate the larger set.

### 3. Manager is the single writer (revised)

Original plan was adapter-level `register()` calls. That races: adapters run in `Promise.all`, each adapter's read-modify-write cycle can clobber another adapter's just-written entries. Manager-level write means one read-modify-write per `listAgents()` — no race.

Trade-off: `AgentInfo` gains `processStartedAtMs` so manager can build `RegistryEntry` without `ProcessInfo`. Minor: the field is intrinsically part of the runtime model anyway.

### 4. `lookupByPid` requires `procStartTime`

Optional invites accidentally skipping the staleness check. Required by signature.

### 5. No `lookupBySessionId`

YAGNI. No v1 caller. Add when there's one.

### 6. OpenCode appears in the registry but doesn't read or write directly

Manager writes for every adapter uniformly. OpenCode's `AgentInfo` flows through `toRegistryEntry` exactly like Claude/Codex/Gemini. OpenCode skips the `lookupByPid` short-circuit because SQLite is already O(ms) — no benefit.

### 7. Hit-path PID-file re-read (Claude only)

Single small JSON read preserves `pidStatus`/`waitingFor` parity with miss path. Cheaper than the full match pipeline; correctness > perf at the margin.

### 8. Name-keyed register (unchanged)

`generateAgentName(cwd, pid)` embeds pid → distinct pids produce distinct names → one entry per live pid follows automatically. No need to rekey `register()` by pid.

### 9. Batched writes via `registerBatch`

Per-entry `register()` would cause O(total agents) atomic file writes per `listAgents()` (~20–50ms cumulative). `registerBatch` reads once, merges all entries in memory, writes once. Combined with decision 3 (manager is single writer), total writes per `listAgents()` is exactly one.

### 10. `tmuxSession` merge on upsert

Auto-upsert from adapters always passes `tmuxSession: ""`. A naive replace would clobber values set by future tmux integration or explicit user registration. Merge rule: keep existing non-empty `tmuxSession` when incoming is empty. All other fields replace, since auto-upsert is the source of truth for live process metadata.

## Non-Functional Requirements

### Performance

| Adapter | Hit-path savings (est.) | Net effect |
|---|---|---|
| Claude | 5–10ms (PID-file already cheap) | ~wash; correctness benefit |
| Codex | 20–100ms (skip day-bucket walk) | clear win |
| Gemini | 50–300ms (skip chats-dir walk + per-file reads) | biggest win |
| OpenCode | n/a (no short-circuit) | unchanged |

Per-call overhead added: 1 atomic write (~2–5ms) + 1 `prune()` sweep (~ms).

### Reliability

- Atomic `tmp + rename` writes (existing). No new failure modes.
- Stale entries never leak: staleness check enforced inside `lookupByPid`; `existsSync` check at call site for the file path.
- `prune()` runs every `listAgents()` — registry can't grow unboundedly.

### Security

- No new data persisted beyond what was already on disk.
- File path stays in `~/.ai-devkit/agents.json`. Same trust boundary.

### Testability

- `AgentRegistry` already takes `filePath` constructor arg — tests use tmp file.
- Adapters get a `registry` constructor arg (default `AgentRegistry.default()`) so unit tests inject a controlled instance.
