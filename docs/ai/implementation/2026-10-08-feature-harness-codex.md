---
phase: implementation
title: harness-codex implementation notes
description: What the I2 codex port shipped and where parity needed fixes
---

# I2: harness-codex implementation

## Shipped

- `rust/crates/devkit-harness/src/codex/mod.rs` — helper-subcommand
  filter (clap flag semantics incl. variadic `--image`, `--` stop,
  app-server-daemon path exclusion), `sessions.json` mapping stage,
  registry-cache stage, locator stage, process-only fallback — all in
  the TS stage/output order.
- `rust/crates/devkit-harness/src/codex/locator.rs` — resume `<uuid>`
  match, uuidv7→day-dir window, `session_meta` head parse with
  truncated-JSON regex fallback, legacy greedy match, 30s unmatched
  negative cache keyed by pid+date-dir signature.
- `rust/crates/devkit-harness/src/codex/parser.rs` — bounded
  head(1MiB)+tail(4MiB) fold, session_meta gate, status mapping
  (idle > waiting > running), summary extraction.
- `shared.rs` — `birthtime_ms`, `local_day_key` (libc `localtime_r`),
  `is_idle`, `truncate`, `parse_timestamp_ms`, `fold_jsonl_bounded`,
  `read_file_head`, `registry_session_paths` (readonly SQLite open of
  `<home>/.ai-devkit/agents.db`, filtered `type='codex'`).
- Daemon: `CodexAdapter` registered in `default_registry` → `ported`
  now `["claude","codex"]`.
- `AgentManager` merge: multi-ported test added (daemon serves both
  ported types; both local adapters skipped).

## Parity issues found via the live bundle

1. **Registry leak** — `AgentRegistry.default()` is SQLite at
   `~/.ai-devkit/agents.db`, not a JSON file; replay used the real db.
   Fixed by a `registry` field on bundles + seeded isolated db on both
   replay sides.
2. **Post-detect registry snapshot** — capture recorded registry state
   after `detectAgents`, including rows the run itself persisted.
   Snapshot moved before detection.
3. **Mapping file not captured** — `.codex/ai-devkit/sessions.json`
   wasn't in `HARNESS_DIRS`; its absence reordered match stages.
   Added `.codex/ai-devkit` to capture.
4. **`$TODAY` over-application** — blanket day-key rewrite broke
   static-start live processes on later replay days. Rewrite now
   applies only to pids with `startTime === "$NOW"`.

## Fixture bundles

- `fixtures/harness/codex/matched.json` — mapping + resume + legacy +
  helper-skip.
- `fixtures/harness/codex/statuses.json` — per-status rows.
- `fixtures/harness/codex/live.json` — gitignored live oracle
  (12 real codex agents).
