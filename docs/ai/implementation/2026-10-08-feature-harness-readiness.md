---
phase: implementation
title: harness-readiness implementation notes
description: What the I11 readiness port shipped and parity decisions made
---

# I11: readiness — implementation

## Shipped

- `rust/crates/devkit-harness/src/readiness/mod.rs` — `Host` trait
  (the four TS injectables), `ReadinessRuntime`, `SystemHost`
  (`libc::access` + `run_with_timeout` — spawn → `wait_with_output` on a
  thread → `mpsc::recv_timeout(5s)` → `SIGKILL` on expiry),
  `readiness_report`/`readiness_reports` (AGENT_TYPES order),
  `default_skill_roots` (the STATUS_SKILL_ROOTS fallbacks).
- `readiness/checks.rs` — `executable_check` (PATH split on `:`,
  X_OK first-hit), `directory_check`, `built_in_skills_check`,
  `script_check` (byte equality vs bundled asset),
  `registration_check` (`hooks[event][*].hooks[*]` command match),
  `mapping_check` (`/^\d+$/` pid keys, stale = sessionPath not R_OK),
  `worst_status`, `display_home`, `record`/`non_empty`.
- `readiness/profiles.rs` — all ten profiles: claude auth+integration,
  codex auth+integration (script+registration+mapping), copilot `gh
  auth status`, devin `^Logged in`m, opencode ANSI-stripped provider
  names, pi auth.json provider names + `pi list` tracker integration;
  configDir-only for gemini_cli/grok_cli/kiro/antigravity_cli.
- `readiness/codex_auth.rs` — file-based codex auth probe:
  `CODEX_HOME`/`~/.codex/auth.json` → `Some(true)` (PAT or non-stale
  oauth via expires_at/expiresAt/expiry/JWT exp), `Some(false)`
  (parsed, no creds), `None` (missing/malformed) — the daemon-side
  equivalent of the TS capacity-probe `codexAuth`.
- `devkit-core::readiness` — wire types with ts-rs export:
  `AgentReadinessReport`, `AgentReadinessResult` (ordered Vec), the
  five check structs; `Option` fields serialize absent (`undefined`),
  never `null`.
- `devkitd`: `agent.readiness` RPC — params `homeDir`/`path`/
  `assetRoot`/`builtInSkillNames`/`skillRoots` (daemon env + defaults
  otherwise), returns `{reports: [...]}` in AGENT_TYPES order.
- `daemon-client`: `agentReadiness(params)` + generated types.
- `status.service.ts`: `agentReadinessReports` — daemon-primary via
  `ensureDaemon` ONLY when the caller injected no fs/command seams
  (`readFile`/`access`/`runCommand`/`codexAuth` are functions and
  can't cross the wire); `Object.fromEntries` rebuilds the keyed map
  in AGENT_TYPES order; any RPC/spawn failure → local
  `getAgentReadinessReports`.

## Parity decisions

- `runCommand` resolves only on exit 0 — spawn failure, non-zero, and
  the 5s timeout are all `Err`, mirroring `execFile` rejection.
- `builtInSkillsCheck` without a skillRoot returns `path: null,
  present: 0, missing: all, status: info` — kiro exercises this.
- Pi `mappingStatus` is `valid || !present → pass` (a missing mapping
  is fine), deliberately looser than `mappingCheck`'s own warn.
- `installed` for claude/codex = script && registration pass —
  `mappingFile` contributes to `status`/`errors`/`details` only.
- `details` sub-check JSON is built via `to_json()` helpers matching
  the TS field order/shape (`matchesBundledAsset`, `invalidEntries`…).
- Reports are a Vec (serde_json maps can't carry AGENT_TYPES key
  order); the client re-keys — `Object.keys` order identical.

## Fixture parity

`fixtures/readiness/{healthy,degraded}.json` — `{options, files
("<dir>" sentinel), executables, commands{"argv-joined": {stdout, ok}},
codexAuth, expected}` replayed by TS (`readiness-fixtures.test.ts`)
and Rust (`FixtureHost`) byte-identically. The degraded bundle
exercises every failure edge: non-zero command exit, missing
executable/config dir, missing bundled asset, invalid registration,
invalid+stale mapping entries, missing providers, empty auth.json.

## Test evidence

- `cargo test --workspace` — 64 harness tests green; `clippy -D
  warnings` clean.
- `vitest` agent-manager — 1345 green (includes the 2 readiness
  fixture replays).
- Live daemon — `agent.readiness` returns 10 reports; statuses match
  machine reality.
- `ai-devkit status` — daemon-primary renders identical output;
  daemon-down (`AI_DEVKIT_NO_DAEMON=1`) falls back and renders.
