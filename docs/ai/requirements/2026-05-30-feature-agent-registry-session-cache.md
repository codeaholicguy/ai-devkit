---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

Two related gaps in the current agent-manager:

1. **No source of truth for "what's currently running."** `AgentRegistry` exists at `~/.ai-devkit/agents.json`, but it only contains entries explicitly registered by callers (user-curated). The set of detected agents and the set of registered agents diverge.
2. **Every `detectAgents()` re-runs an expensive matching pipeline.** Each adapter discovers session files from disk on every call to pair them with live processes. The cost varies by adapter:
   - **Claude:** resume regex + PID-file read + (legacy CWD/birthtime walk if both miss). PID-file path covers the common case cheaply.
   - **Codex:** legacy walk only, across `~/.codex/sessions/YYYY/MM/DD/` day buckets (±1 day window). `stat` per JSONL.
   - **Gemini CLI:** legacy walk only, across multiple Gemini `chats/` dirs. `readFile` per session file during discovery.
   - **OpenCode:** SQLite lookup (already fast).

The registry has not been released, so the on-disk shape can change freely.

## Goals & Objectives

### Primary goals

1. **Registry contract.** After every `AgentManager.listAgents()`, `AgentRegistry` contains exactly one entry per active agent across all adapters (Claude, Codex, Gemini, OpenCode). Dead pids are removed in the same flow.
2. **Cache short-circuit on legacy-walk adapters.** Claude, Codex, and Gemini check `registry.lookupByPid(pid, startTime)` at the start of `detectAgents()`; on a valid hit they skip session discovery and parse the cached `sessionFilePath` directly.
3. **Self-healing.** Stale entries (PID recycled, session file deleted, mismatched start time) fall through to the existing matching pipeline and write back on success.

### Secondary goals

- Provide a uniform `RegistryEntry` shape so future flows (e.g., resume-by-session) have a single source of truth.
- Keep the on-disk file bounded by live processes via `prune()`.

### Non-goals

- **Caching session content.** `summary`, `status`, `lastActive` mutate on every prompt and must be re-derived from the JSONL/DB on every call. The cache stores only the (pid → sessionId, sessionFilePath) mapping.
- **OpenCode cache short-circuit.** OpenCode's matching is a SQLite query, already fast. OpenCode still writes through to the registry to honor the contract, but does not consult `lookupByPid`.
- **`listSessions()` indexing.** Separate concern, not in scope.
- **Schema versioning / migration.** Registry unreleased.
- **`lookupBySessionId`.** No caller in v1. Add when needed.
- **Optimizing `ps aux`/`lsof` baseline cost.** Those dominate; addressed separately if needed.

## User Stories & Use Cases

- As a CLI user listing agents from a TUI that polls frequently, I want Codex and Gemini detection to skip the per-call directory walk so polling stays cheap regardless of how many historical sessions are on disk.
- As an integrator inspecting active agents programmatically, I want `~/.ai-devkit/agents.json` to be an accurate reflection of "what's running right now," not just "what was explicitly named."
- As a future feature author building resume-by-session or cross-tool agent coordination, I want every active agent to have a registry entry I can read from without spinning up the full adapter pipeline.

### Edge cases

- **PID recycled by OS.** `lookupByPid` requires `procStartTime: Date` and rejects entries whose `processStartedAtMs` diverges by more than `PID_FILE_STALENESS_MS` (60s).
- **Session file deleted between detects.** Hit-path call site verifies `fs.existsSync(entry.sessionFilePath)`; absence forces re-match.
- **Process exited between detects.** `AgentManager.listAgents()` calls `registry.prune()` after upsert; dead pids drop in the same flow.
- **Two adapters detect the same pid.** Not possible in practice — `canHandle()` keys on the executable name. Names embed pid (`folder-pid`) so collisions don't occur.
- **OpenCode entries.** Get written through to the registry like every other adapter; just skip the cache lookup at detection.

## Success Criteria

### Functional

- After any `listAgents()` call, `registry.list()` returns exactly the set of currently-active agents (verified against the same `listAgents()` result).
- `prune()` is invoked once per `listAgents()`; dead pids removed before return.
- Each affected adapter (Claude, Codex, Gemini) reads from the cache before its matching pipeline and writes back on miss.

### Performance

- Cache hit path in Claude/Codex/Gemini adapters: zero filesystem calls between `enrichProcesses` and session content read.
- Codex/Gemini expected savings per `listAgents()`: 20–300ms depending on history size (the legacy walk is what's being skipped).
- Claude expected savings: 5–10ms in the common case (PID file already cheap).
- New cost: 1 atomic registry write per `listAgents()` (~2–5ms).

### Quality

- Unit tests cover hit, miss, stale-pid, missing-session-file paths for Claude/Codex/Gemini.
- Behavior parity: same `AgentInfo[]` shape on hit vs miss.
- `lint --feature agent-registry-session-cache` passes; full test suite green.
- Manual verification: delete `~/.ai-devkit/agents.json`, run `ai-devkit agents ls` twice, confirm second call has the cache populated and identical output.

## Constraints & Assumptions

### Technical

- `RegistryEntry` gains `processStartedAtMs: number`, `sessionId: string`, `sessionFilePath: string`. No version field.
- `lookupByPid(pid: number, procStartTime: Date): RegistryEntry | null` — `procStartTime` is required; staleness check is internal.
- New `registerBatch(entries: RegistryEntry[]): void` — single read + single write for all entries from one adapter. Existing `register()` keeps its single-entry semantics.
- `register()` and `registerBatch()` upsert by `name`. Since `generateAgentName(cwd, pid)` embeds pid, distinct pids produce distinct names; the "one entry per live process" invariant follows automatically.
- On upsert, `tmuxSession` is merged: if the existing entry has a non-empty `tmuxSession` and the incoming entry has empty string, the existing value is preserved. All other fields replace.
- Each adapter owns its own `registerBatch()` call at the end of `detectAgents()` (avoids threading `ProcessInfo` back through `AgentManager` and avoids N writes per detect).
- `AgentManager.listAgents()` calls `registry.prune()` once after all adapters have run.
- `PID_FILE_STALENESS_MS` constant becomes the registry's source of truth and is imported by `ClaudeCodeAdapter` (single definition).
- OpenCode's `sessionFilePath` is empty string (DB-backed, no file path concept). Cache-check guard (`fs.existsSync(sessionFilePath)`) rejects it cleanly if any future code path tries to use it.

### Assumptions

- `enrichProcesses` always populates `ProcessInfo.startTime` for every proc returned by `listAgentProcesses`. (Verified.)
- Atomic `tmp + rename` writes in `AgentRegistry.writeFile` handle concurrent CLI processes safely; last-writer-wins is acceptable for a cache.
- `AgentRegistry.default()` singleton is shared across adapters and the manager.

## Questions & Open Items

Resolved during design discussion:

- **Where does the cache check live?** Adapter (per-adapter matching pipeline).
- **Where does `register()` get called?** Adapter — keeps proc-threading local.
- **Where does `prune()` get called?** `AgentManager.listAgents()` once after all adapters.
- **Pid-keyed or name-keyed registry?** Name-keyed (existing behavior). Names embed pid, so one-entry-per-pid invariant holds.
- **OpenCode included?** Yes for the registry contract (write through), no for the cache short-circuit (marginal benefit).
- **Hit-path correctness for Claude `pidStatus`/`waitingFor`?** Hit path re-reads `~/.claude/sessions/<pid>.json` (single small JSON, ~1 syscall) to keep `AgentInfo` parity with miss path.

Resolved during Phase 2 review:

- **Disk write cost?** `registerBatch(entries)` — one write per adapter per `listAgents()`, not one per agent.
- **`tmuxSession` clobber on auto-upsert?** Merge semantics — preserve existing non-empty `tmuxSession` when incoming is empty string.
- **OpenCode `sessionFilePath`?** Empty string. `existsSync("")` is false, so cache-check guard rejects cleanly.
