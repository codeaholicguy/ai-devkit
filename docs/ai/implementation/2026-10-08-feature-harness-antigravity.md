---
phase: implementation
title: harness-antigravity implementation notes
description: What the I10 antigravity port shipped and parity decisions made
---

# I10: harness-antigravity implementation

## Shipped

- `rust/crates/devkit-harness/src/antigravity/mod.rs` —
  `AntigravityCliAdapter` (type `antigravity_cli`): `agy` pool +
  `matches_executable` + dedupe; per-proc cwd→conversation join;
  session-or-process-only emission in process order.
- `rust/crates/devkit-harness/src/antigravity/locator.rs` —
  `last_conversations.json` read + `match_running_processes`.
- `rust/crates/devkit-harness/src/antigravity/parser.rs` — bounded
  summary fold (MAX `created_at`, USER_REQUEST extraction, last
  user/assistant role), `determineStatus`.
- `shared::matches_executable_name` — `.exe`+lowercase normalization on
  candidate basenames (all three match sites), fixing a latent pool
  filter drop for `*.exe` procs across adapters.
- `capture.ts` — explicit `HARNESS_INDEX_DIRS` set (same effective
  partition as the old suffix heuristic) + `.gemini/antigravity-cli`
  referenced-only; `fixtures.test.ts` pins `ANTIGRAVITY_CLI_HOME` during
  replay + live capture case.
- Daemon: `AntigravityCliAdapter` registered → `ported` += `antigravity_cli`
  — all ten harnesses now ported.

## Parity decisions

- `read_session` gates on `fs::metadata` alone (TS `!stat`) — a dir at
  the transcript path emits a session with an empty summary.
- `created_at` MAX not last-write — the fold only replaces on strict `>`.
- `extractUserRequest` without regex: first open-tag → first close-tag
  substring, trimmed; identical result for well-formed and unclosed
  inputs (unclosed → falls to whole-text trim like the failed match).
- Summary intentionally NOT truncated (`lastUserMessage ||` default) —
  the only adapter with this rule.
- Empty-string `lastUserMessage` (empty `<USER_REQUEST></USER_REQUEST>`)
  is preserved through the reduce then falsy-collapsed at map time.
- `ANTIGRAVITY_CLI_HOME` read once at construction (TS locator ctor) —
  replay uses `at_base_dir`, daemon uses `new(home)`.

## Test evidence

- `cargo test -p devkit-harness` — 63 green incl. both bundles.
- `cargo test --workspace` + `clippy -D warnings` — clean.
- `vitest` agent-manager — 1343 green; byte-identical replay.
- Live smoke — `ported` includes `antigravity_cli` (10/10); no live
  `agy` procs on the machine.
