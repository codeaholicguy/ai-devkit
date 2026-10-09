---
phase: implementation
title: harness-kiro implementation notes
description: What the I9 kiro port shipped and parity decisions made
---

# I9: harness-kiro implementation

## Shipped

- `rust/crates/devkit-harness/src/kiro/mod.rs` — `KiroAdapter`
  (type `kiro`): five-name pool filter, `is_kiro_executable` argv0 +
  node/bun-script detection (`kiro_basename` `.exe`/`.js` strip), lock
  matches → per-session agents, process-only fallback.
- `rust/crates/devkit-harness/src/kiro/locator.rs` — lock discovery +
  ancestor walk + tty fallback.
- `rust/crates/devkit-harness/src/kiro/parser.rs` — bounded summary fold,
  metadata read, `determineStatus` equivalent.
- `shared::list_dir_names` — sorted readdir mirror; adopted by every
  adapter locator (fixes latent ordering parity for kiro's lock-ordered
  output and hardens copilot/devin/grok/gemini/pi/codex/claude).
- `capture.ts` — `.kiro/sessions/cli` index dir + live capture case.
- Daemon: `KiroAdapter` registered → `ported` += `kiro`.

## Parity decisions

- `to_pid` uses `as_f64` + integral/≤2^53−1 bounds — JS `Number.isSafeInteger`
  admits `5.0`, which `as_i64` would drop.
- Lock JSON must parse as an object (`asRecord`); `{"pid":"1101"}` string
  digits accepted like `toPid`'s `/^\d+$/` path.
- `read_session` requires the transcript to be a file (matches skipped →
  process-only) but tolerates unreadable content (empty summary).
- Status order: idle → waiting (assistant, no toolUse) → running.
- Summary chain `lastUserMessage || title || "Kiro session active"` —
  `lastUserMessage` is never empty when present (`entryToMessage` drops
  empty content), so the `||` semantics collapse cleanly.
- `relevant` order preserved for `by_pid`/tty filters; `processes`
  first-wins dedupe preserved for process-only sweep order.
- mtime fallback covered via `mtimes` in matched.json (s3).

## Test evidence

- `cargo test -p devkit-harness` — 62 green incl. both kiro bundles.
- `cargo test --workspace` + `clippy -D warnings` — clean.
- `vitest` agent-manager — 1341 green; kiro replays byte-identical.
- Live smoke — `ported` includes `kiro` (no live procs on the machine).
