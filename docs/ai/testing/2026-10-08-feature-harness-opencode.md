---
phase: testing
title: harness-opencode test report
description: Coverage and results for the I7 opencode port
---

# I7: harness-opencode testing

## Fixture parity (the oracle)

Two committed bundles replay byte-identical TS↔Rust
(`vitest -t opencode` and `cargo test opencode_adapter_matches`):

- `matched.json` — session match per status: running (assistant without
  `time.completed`), waiting (assistant completed), idle (60min-old
  heartbeat), session with zero messages (heartbeat NULL →
  lastActive=timeCreated, lastRole null → running, default summary);
  newest-session-for-directory pick (older session for the same dir
  ignored); first-user-text summary + whitespace trim; tool-type parts
  don't pollute the summary; no-session directory → process-only;
  cwd-less proc → `unknown-<pid>` process-only.
- `fallback.json` — no `sqlite` section → db missing → every proc
  process-only; foreign `node` argv0 dropped by the pool filter.

## Coverage notes

- The `sqlite` bundle section itself is exercised: DDL + INSERTs
  materialize a real opencode.db under the fixture home on both replay
  sides.
- Live capture (`AI_DEVKIT_FIXTURE_CAPTURE=1` opencode case) dumps the
  real `sqlite_master` DDL + rows reachable via proc cwds; no live
  opencode process was running on this machine, so only the synthetic
  bundles run in CI.

## Results

- `cargo test --workspace`: 78 tests green; `clippy -D warnings` clean.
- `vitest` agent-manager: 1336 passed.
- Live daemon smoke: `ported` includes `opencode`
  (`["claude","codex","pi","gemini_cli","copilot","grok_cli","opencode"]`,
  16 live agents, none opencode on this machine).
