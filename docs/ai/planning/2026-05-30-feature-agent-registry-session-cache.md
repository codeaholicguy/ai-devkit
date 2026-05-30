---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Tasks

### Registry

- [ ] Move `PID_FILE_STALENESS_MS` (60000) to `AgentRegistry.ts` as an exported constant; import in `ClaudeCodeAdapter` to replace the private duplicate.
- [ ] Extend `RegistryEntry` with `processStartedAtMs: number`, `sessionId: string`, `sessionFilePath: string`.
- [ ] Add `AgentRegistry.lookupByPid(pid: number, procStartTime: Date): RegistryEntry | null` — scan `entries[]` by pid, apply staleness check internally, return entry or null.
- [ ] Add `AgentRegistry.registerBatch(entries: RegistryEntry[]): void` — single read, in-memory merge per entry, single atomic write.
- [ ] Implement `tmuxSession` merge rule in both `register()` and `registerBatch()`: preserve existing non-empty value when incoming is empty string; replace all other fields.
- [ ] Unit tests for `AgentRegistry`: hit, miss (no entry), miss (stale pid > 60s), prune drops dead pids carrying new fields, `register()`/`registerBatch()` upsert with new fields, `tmuxSession` merge, `registerBatch` performs single write for N entries.

### AgentInfo

- [ ] Add required field `processStartedAtMs: number` to `AgentInfo` in `packages/agent-manager/src/adapters/AgentAdapter.ts`.
- [ ] Update every `AgentInfo` constructor (across all 4 adapters' mapping functions including process-only fallbacks) to populate `processStartedAtMs` from `proc.startTime!.getTime()`. Where `proc.startTime` is missing, use `Date.now()` as a defensive fallback (logs a warning).
- [ ] Update any test fixtures that construct `AgentInfo` literals to include the new field.

### Manager (single writer)

- [ ] In `AgentManager.listAgents()`, after the adapter aggregation loop and before name overlay + sort:
  - Build `RegistryEntry[]` from `allAgents` via a private `toRegistryEntry(agent)` helper.
  - Call `this.registry.registerBatch(entries)` once when `entries.length > 0`.
  - Call `this.registry.prune()` once.
- [ ] `toRegistryEntry` helper (in `AgentManager.ts`): maps `AgentInfo` → `RegistryEntry`. `tmuxSession: ''`, `cwd: agent.projectPath`, `startedAt: new Date(agent.processStartedAtMs).toISOString()`, `sessionFilePath: agent.sessionFilePath ?? ''`.
- [ ] Unit tests: `registerBatch` invoked once per `listAgents()` with all aggregated entries; `prune()` invoked once per `listAgents()`; both run even when one adapter throws; `tmuxSession` preserved across cycles when a prior entry had a non-empty value.

### Adapter base wiring

- [ ] Add optional `registry: AgentRegistry` constructor arg to Claude/Codex/Gemini adapters, defaulting to `AgentRegistry.default()`. OpenCode does **not** get the arg (no registry interaction).
- [ ] Confirm CLI / factory call sites work unchanged (default singleton picks up the registry).

### ClaudeCodeAdapter

- [ ] In `detectAgents()`, partition processes into `cached` (registry hit + `existsSync(sessionFilePath)`) and `uncached`.
- [ ] For each `cached` proc, read `~/.claude/sessions/<pid>.json` via existing `readMatchingPidFile(pid, startTime)` (single small JSON) so hit path passes `pidStatus`/`waitingFor` into `mapSessionToAgent`.
- [ ] For each `cached` proc, call `parser.readSession(entry.sessionFilePath, entry.cwd)`; on failure, demote to `uncached`.
- [ ] Run the existing pipeline (`tryResumeMatching` → `tryPidFileMatching` → legacy) for `uncached` — no changes to that code.
- [ ] Ensure every `AgentInfo` returned (hit + miss + process-only) populates `processStartedAtMs`.
- [ ] **No `registry.register` or `registry.registerBatch` calls** — manager handles writes.
- [ ] Unit tests: cache hit short-circuits matching (mock parser, assert no resume regex / no PID-file legacy walk), cache miss falls through, stale pid forces re-match, missing session file forces re-match, hit-path preserves `pidStatus`/`waitingFor` parity, all returned `AgentInfo` carry non-zero `processStartedAtMs`.

### CodexAdapter

- [ ] Same partition pattern. Cached procs skip `discoverSessions` day-bucket walk and parse the cached `sessionFilePath` directly.
- [ ] Populate `processStartedAtMs` on every returned `AgentInfo`.
- [ ] **No registry writes.**
- [ ] Unit tests mirroring Claude's: hit, miss, stale pid, missing file, `processStartedAtMs` populated.

### GeminiCliAdapter

- [ ] Same partition pattern. Cached procs skip the chats-dir walk + per-file reads.
- [ ] Populate `processStartedAtMs` on every returned `AgentInfo`.
- [ ] **No registry writes.**
- [ ] Unit tests mirroring Claude's.

### OpenCodeAdapter

- [ ] No registry interaction at all. Just populate `processStartedAtMs` on every returned `AgentInfo`.
- [ ] Unit test: every `AgentInfo` carries `processStartedAtMs` matching `proc.startTime.getTime()`.

### Verification

- [ ] `npm test -w packages/agent-manager` green.
- [ ] `npx ai-devkit@latest lint --feature agent-registry-session-cache` passes.
- [ ] Manual: delete `~/.ai-devkit/agents.json`, run `ai-devkit agents ls` twice. Confirm second call has cache entries and identical output. Repeat with Codex and Gemini if those agents are available locally.
- [ ] Manual sanity: kill an agent process between two `agents ls` calls; confirm its entry disappears after the second call (prune).
- [ ] Manual: set `tmuxSession` on an existing entry by hand; run `agents ls`; confirm value preserved (merge rule).

## Dependencies

- Registry tasks land first.
- `AgentInfo.processStartedAtMs` lands before manager + adapter changes (it's a required field; everything that constructs `AgentInfo` needs to populate it).
- Manager changes can land alongside adapter changes — adapters only need `lookupByPid` (read-only); they don't depend on `registerBatch` directly.
- Adapter changes are independent of each other — can land in parallel after the registry + `AgentInfo` field land.

## Risks

- **Risk:** `enrichProcesses` returns a proc without `startTime`. **Mitigation:** Cache lookup skips that proc; existing pipeline runs. `processStartedAtMs` falls back to `Date.now()` with a warning so the field is always populated.
- **Risk:** Concurrent `ai-devkit agents ls` invocations from different shells race on registry writes. **Mitigation:** Atomic `tmp + rename` (existing). Last-writer-wins is acceptable for a cache — both writers had freshly-detected entries.
- **Risk:** Hit path drifts from miss path in `AgentInfo` shape (Claude `pidStatus`/`waitingFor`). **Mitigation:** Hit path re-reads `~/.claude/sessions/<pid>.json`; unit test asserts parity.
- **Risk:** Adding required field `processStartedAtMs` to `AgentInfo` breaks downstream consumers (CLI table renderer, TUI, JSON output). **Mitigation:** Audit consumers; the field is additive (new property, no rename) so most code is unaffected. Mark in PR description.
- **Risk:** Manager-level `toRegistryEntry` couples manager to `RegistryEntry` shape. **Mitigation:** Acceptable — manager already knows about `AgentRegistry`; the mapping is mechanical and isolated to one helper.
