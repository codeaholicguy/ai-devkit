---
phase: testing
title: harness-grok test report
description: Coverage and results for the I6 grok port
---

# I6: harness-grok testing

## Fixture parity (the oracle)

Two committed bundles replay byte-identical TS↔Rust
(`vitest -t grok` and `cargo test grok_adapter_matches`):

- `matched.json` — active_sessions.json cwd override (proc.cwd ignored);
  two session dirs in one group → max-mtime pick (`mtimes` map);
  `<user_query>` extraction with a `<user_info>` context record skipped;
  array-of-blocks assistant content flattened; waiting + running
  statuses; process-only fallback; `node`/`grok-helper` argv0 drops.
- `fallback.json` — group dir without transcript → process-only;
  missing proc cwd → `unknown-<pid>`/`""` projectPath; empty transcript
  still yields a session ("Grok CLI session active"); old chat mtime →
  idle.

## Unit coverage (Rust)

- `extract_user_query`: trimmed inner, empty tag → "" message, unclosed
  tag and non-user_query wrappers → None.
- `to_message`: user/assistant/array-content/non-object/system(quiet)
  cases.

## Results

- `cargo test --workspace`: 77 tests green; `clippy -D warnings` clean.
- `vitest` agent-manager: 1334 passed (earlier run flaked 4 files under
  940s contention; clean re-run).
- Live daemon smoke: `ported` includes `grok_cli`.
- No live grok process or `~/.grok` tree on this machine — live capture
  case is in place for a machine that has one.
