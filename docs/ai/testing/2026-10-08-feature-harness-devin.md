---
phase: testing
title: harness-devin test report
description: Coverage and results for the I8 devin port
---

# I8: harness-devin testing

## Fixture parity (the oracle)

Three bundles replay byte-identical TS↔Rust (`vitest -t devin`,
`cargo test devin_adapter_matches`):

- `matched.json` — lock-held session via backend-child ppid (TUI gets
  the agent, `devin acp` child emits none); standalone `devin acp` with
  ppid outside the snapshot kept as agent; dead-pid + malformed locks
  skipped; slug precedence over cwd (projectPath =
  session.directory `/proj/elsewhere`); `hidden=1` excluded;
  newest-`last_activity_at`-for-dir pick; summary sources —
  prompt_history (with `is_shell`/`/%` filters) → node scan → title;
  utility subcommands (`list`, `ssh`, `--config x list`) dropped;
  `-p`/`--print` flag-value skipping keeps `devin -p update` an agent.
- `fallback.json` — locks present but db missing → all procs
  process-only; acp child still skipped; cwd-less → `unknown-<pid>`.
- `live.json` — 2 real devin agents (one waiting TUI, one idle); 47
  bounded SQL statements (frontier + max-created + user-8 + prompt-1
  per session); 4 real lock files.

## Coverage notes

- Live capture for devin dumps `sessions` by proc-cwd ∪ lock-slug and
  bounded reachable `message_nodes`/`prompt_history` — verified on the
  real 4-session db (97MB → <1MB after bounding; `= MAX()` timestamp
  collisions fixed via `ORDER BY created_at DESC LIMIT 1`).
- `fixtures.rs` now parses float `mtimes` (live `mtimeMs` is a float) —
  also fixes live grok/pi/copilot captures on future runs.

## Results

- `cargo test --workspace`: 79 tests green; `clippy -D warnings` clean.
- `vitest` agent-manager: 1339 passed.
- Live daemon smoke: `ported` includes `devin`
  (`[…,"opencode","devin"]`, 18 live agents — 2 real devin).
