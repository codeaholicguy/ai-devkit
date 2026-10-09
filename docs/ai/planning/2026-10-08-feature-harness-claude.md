---
phase: planning
title: harness-claude task plan
description: Task breakdown for the I1 claude port — reconciled post-implementation
---

# I1: harness-claude plan (reconciled)

## Tasks

### Discovery foundation

- [x] Add `start_time_ms` to `AgentProc`; batch `lsof` cwd + `ps lstart`
      enrichment in `apply_sweep` (macOS + Linux `/proc` fast path)

### Rust port (`devkit-harness::claude`)

- [x] `shared.rs` — executable path/name matching + ISO-8601 helpers
- [x] `locator.rs` — resume → PID-file (60s staleness) → legacy greedy
      (3min) → process-only fallback
- [x] `parser.rs` — bounded head/tail JSONL scan, status fold, summary +
      command extraction, noise filtering
- [x] `mod.rs` — adapter orchestration, PID-file status/waitingFor override,
      kebab-case naming, `EnrichedAgent` mapping
- [x] Register `ClaudeAdapter` in devkitd; `ported: ["claude"]`

### Fixture oracle

- [x] `fixtures.rs` Rust replay harness mirroring TS `bundle.ts` semantics
- [x] `$NOW` sentinel support on both replay sides (birthtime determinism)
- [x] Committed synthetic bundles: `matched.json` (resume + stale-pidfile→
      legacy + process-only), `statuses.json` (all status mappings via
      PID-file)
- [x] Byte-identical parity: live + both synthetic bundles, Rust & TS

### Merge path

- [x] `AgentManagerOptions.fetchEnrichedAgents`; ported-filter merge in
      `listAgents`; null/throw → all-local
- [x] 5 unit tests covering ported skip, unported coexistence, null/throw
      fallback, unported-row drop
- [x] CLI wiring via `ensureDaemon()` (implicit spawn) in `createAgentManager`
- [x] Live smoke: auto-spawn + `agent list` + `enrichedAgents()` parity

### Build glue

- [x] ts-rs export post-process: `./X` → `./X.js` for nodenext

## Done

I1 complete; `ported` = `["claude"]` on the live daemon. Next: I2 codex.
