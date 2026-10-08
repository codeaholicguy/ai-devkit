---
phase: testing
title: harness-codex test report
description: Coverage and results for the I2 codex port
---

# I2: harness-codex testing

## Fixture parity (the oracle)

- Synthetic bundles `matched.json` + `statuses.json` replay
  byte-identical on both sides:
  `vitest src/__tests__/fixtures.test.ts` and
  `cargo test -p devkit-harness codex_adapter_matches_committed_fixtures`.
- Live bundle (`live.json`, gitignored; 12 real codex agents) replays
  byte-identical on both sides — it caught four real bugs (registry
  leak, post-detect snapshot, missing mapping file, `$TODAY` scope).

## Unit coverage (Rust)

- `is_helper_command`: every helper subcommand + app-server-daemon path;
  interactive `codex|resume|fork|exec|review` kept; flag/positional
  parsing incl. variadic `--image` and `--` stop.
- `to_pid_json`: digits-only, >0.
- Parser: session_meta required, running vs waiting status payloads.
- `registry_session_paths`: readonly open, missing db → empty.

## Daemon

- `agent.enriched` returns `ported: ["claude","codex"]`.
- `AgentManager` multi-ported merge test (both locals skipped).

## Suites

- `cargo test --workspace` / `cargo clippy --workspace -- -D warnings`.
- agent-manager vitest incl. fixtures + AgentManager merge.
