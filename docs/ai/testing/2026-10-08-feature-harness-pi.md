---
phase: testing
title: harness-pi test report
description: Coverage and results for the I3 pi port
---

# I3: harness-pi testing

## Fixture parity (the oracle)

- Synthetic bundles `matched.json` + `fallback.json` replay
  byte-identical on both sides:
  `vitest src/__tests__/fixtures.test.ts -t pi` and
  `cargo test -p devkit-harness pi_adapter_matches_committed_fixtures`.
- `matched.json` covers: tracker mapping (30001), registry fallback
  (30002), legacy locator match via `$NOW` start (30003), process-only
  (30004), and a non-pi `pilot` command correctly ignored (30005).
- `fallback.json` covers: stale cross-type registry row (rejected),
  untrusted tracker path outside sessions root (rejected), entry-free
  session file (parse-fail → process-only).
- Live bundle `live.json` (gitignored, real pi process pid 28617)
  replays byte-identical on both sides — 1 pi agent with real session
  metadata.

## Unit coverage (Rust)

- `is_pi_executable`: `pi`, `pi.js`, `pi.exe`, `node <path>/pi.js`,
  `pilot` rejected.
- `to_pid`: digits-only, >0.
- `encode_project_dir` / `file_name_timestamp_ms`.
- Parser: empty file → None; role/type-field filtering; assistant tail
  → waiting; filename session-id fallback; head fields sticky to first
  entry.

## Daemon (live smoke)

- `ensureDaemon` + `agent.enriched` on the real socket:
  `ported: ["claude","codex","pi"]`, 16 agents, the live pi process
  enriched with real sessionId, projectPath
  (`/Users/…/CodexBar`), summary `"which model are you"`, status idle.

## Results

- `cargo test --workspace`: 58 tests green; `clippy -D warnings` clean.
- `vitest` agent-manager: 1326 passed.
