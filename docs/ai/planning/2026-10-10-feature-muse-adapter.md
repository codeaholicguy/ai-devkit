---
phase: planning
title: Project Planning & Task Breakdown
description: Break down the implementation into actionable tasks
---

# Project Planning & Task Breakdown

Scope: v1 vertical slice (user-approved). Every task traces to requirements (R),
design (D), or testing scenarios (T).

## Milestone 0 — Worktree bootstrap

- [x] T0 Bootstrap worktree dependencies.
  Outcome: worktree `npm ci` (or documented offline fallback) so vitest/tsc run.
  Deps: none. Validation: `vitest --version` runs in worktree agent-manager.
  Risk: sandbox network/npm-cache limits; record fallback if install fails.

## Milestone 1 — Parser spike (time-boxed)

- [x] T1 Decide framed parser vs `muse export` for `getConversation`.
  Outcome: recorded decision with cost/latency/freshness numbers on a large transcript.
  Deps: T0. Validation: spike notes in implementation doc. Traces to D-open-item, R-open-item.
  Scenarios: T tail-cost, T message ordering.

## Milestone 2 — Discovery (locator + fixtures)

- [x] T2 `muse/MuseSessionLocator.ts`: runtime-dir PID match with start-time staleness guard,
  dated-archive flatten walk with UUID regex, live/archive merge, noise exclusions
  (`subagent/`, `approval-review/`, logs, sqlite), mtime cache.
  Outcome: staged strategies mirror Claude's locator. Deps: T0. Validation: locator unit tests
  on fake home trees. Traces to R-goals 1–3, D-locator. Scenarios: live detect, stale pid,
  archive filter, runtime-first resolve, unreadable files.
- [x] T3 `fixtures/harness/muse/matched.json` + `fallback.json`: live runtime entry, stale
  variant, framed transcript lines (test in worktree, never real `~/.local`).
  Deps: T2. Validation: fixtures load in tests. Traces to R-goal 6.

## Milestone 3 — Parsing + mapping

- [x] T4 `muse/MuseSessionParser.ts`: two-stage framed parse, `payload_type` dispatch,
  user/assistant extraction, first-message filtering, µs→ms timestamps.
  (If T1 picks export: thin wrapper + redaction handling instead.)
  Deps: T1. Validation: parser tests incl. tail slicing. Traces to R-goal 4, D-parser.
  Scenarios: ordering, tail cost, filtering, timestamp normalization.
- [x] T5 `muse/MuseAgentMapper.ts`: name from `workspace_label`/`session_name`, summary from
  last user prompt, tail-heuristic status, idle threshold via shared helper.
  Deps: T4. Validation: mapper tests. Traces to R-goal 1, D-mapper.

## Milestone 4 — Adapter + registration

- [x] T6 `muse/MuseAdapter.ts` + type-forced registration: `AGENT_TYPES`, `processNames`
  for the `muse-bin-*` shape, `canHandle`, `detectAgents`, `getConversation`,
  `listSessions` (strict cwd), `findSessionsById` (runtime-first); register in
  `createBuiltinAdapters()`; add `HARNESS_RUNTIME_PROFILES.muse` (`matchArgv0Name`-style,
  command `muse`).
  Deps: T2, T5. Validation: adapter tests + `tsc` (Record types enforce the checklist).
  Traces to R-goals 1–4, D-checklist. Scenarios: detect, cwd filter, verbatim id round-trip.

## Milestone 5 — Readiness

- [x] T7 `muse/readiness.ts` + `muse/credentials.ts` (`~/.config/muse/auth.json` state) +
  `READINESS_PROFILES.muse` (configDir `.config/muse`).
  Deps: T0. Validation: readiness matrix tests. Traces to R-goal 5, D-readiness.
  Scenarios: readiness matrix.

## Milestone 6 — Verification + docs

- [x] T8 Blast-radius sweep: run full agent-manager suite; fix count/snapshot tests that
  enumerate `AGENT_TYPES` or readiness types; run `lint --feature muse-adapter`.
  Deps: T6, T7. Validation: green suite, lint 12+ checks pass.
- [ ] T9 Update implementation doc with what shipped, deviations, and v2 handoff notes
  (send transport, exit-cleanup, status heuristic).
  Deps: T8. Validation: Phase 7 check (code matches design).
- [x] T10 Rust `devkitd` detection parity (added scope): `muse/` port (locator, parser,
  adapter), `matches_executable_prefix` in harness `shared.rs`, daemon pool-gate prefix
  in `devkit-core` `discover.rs`, registry + parity-test wiring, golden fixtures replay.
  Validation: `cargo test -p devkit-harness -p devkit-core` green, clippy clean.

## Risks / sequencing

- Order: T0 → T1 → T2/T3 → T4/T5 → T6 → T7 (T7 parallelizable after T0) → T8 → T9.
- Biggest risk: framed-schema drift; mitigated by validating against `muse schema` output.
- `AGENT_TYPES` append affects every consumer of the union; T8 exists for that reason.
- Rust mirror, send, durable runs stay out; any code reaching toward them gets cut.

## Status (Phase 6 reconciliation)

All implementation tasks T0–T8 done; T9 (this implementation doc update) in progress.
No scope changes. One intermittent ManagedAgentRuntime spaced-path failure observed once
in full-suite parallelism (passes in isolation and on reruns); treated as pre-existing
flake, needs a watch item, not a code change. No new tasks discovered.
