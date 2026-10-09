---
phase: implementation
title: harness-claude implementation
description: Rust port of ClaudeCodeAdapter into devkit-harness + daemon merge path
---

# I1: harness-claude implementation

## Structure

- `rust/crates/devkit-harness/src/claude/` — the port
  - `locator.rs` — resume (`--resume <uuid>`), PID-file (`~/.claude/sessions/<pid>.json`,
    60s start-time staleness), legacy greedy cwd+birthtime (3min window) matching,
    process-only fallback
  - `parser.rs` — bounded head(1MiB)/tail(4MiB) JSONL cold scan; folds user/assistant/
    system/progress/thinking into status + summary; filters noise lines and
    permission-mode/ai-title UI events; command-message + args extraction
  - `mod.rs` — `ClaudeAdapter` implementing `HarnessAdapter` (`type_id`, `can_handle`,
    `detect`); PID-file status/waitingFor overrides JSONL; kebab-case naming
- `rust/crates/devkit-harness/src/shared.rs` — `executable_path`,
  `matches_executable_name`, ISO-8601 parsing helpers shared by future ports
- `rust/crates/devkit-harness/src/fixtures.rs` — bundle replay: materializes
  `$FIXTURE_HOME`/`$NOW` sentinels, runs the adapter, byte-compares against
  `expected`

## Process enrichment (devkit-core)

`discover.rs` gained `start_time_ms` on `AgentProc` plus `enrich_agents()`:
batch `lsof -a -d cwd -Fn -p <pids>` for cwd on macOS (`/proc` fast path on
Linux) and batch `ps -o pid=,lstart= -p <pids>` for start times. `apply_sweep`
calls it before harness enrichment, so candidate processes arrive fully
attributed.

## Merge path (agent-manager)

`AgentManagerOptions.fetchEnrichedAgents` returns the daemon's
`EnrichedAgentsResult` (`agents` + `ported`). `listAgents` pushes daemon rows
whose `type` is in `ported` (wire `string` fields cast to `AgentType`/
`AgentStatus`, `lastActive` ISO → `Date`), then filters registered adapters
to exclude ported types. Null/throw → `portedTypes` cleared → all-local.
Registry merge, runtime enrichment, sorting unchanged downstream.

## CLI wiring

`createAgentManager` injects `fetchEnrichedAgents` = `ensureDaemon()` →
`enrichedAgents()` → `close()`. `ensureDaemon` gives tmux-style implicit
spawn (guarded off under vitest / `AI_DEVKIT_NO_DAEMON`).

## Decisions

- Cold-start parser only — no incremental offset cache across sweeps (deferred
  to I12 efficiency pass).
- `getConversation`/`listSessions`/`findSessionsById` stay TS-side.
- ts-rs export test post-processes `from "./X"` → `from "./X.js"` for nodenext.
- Bundle `expected` keeps `$FIXTURE_HOME` literally; only materialized inputs
  expand it. `$NOW` expands at write time via a separate helper (TS + Rust).
