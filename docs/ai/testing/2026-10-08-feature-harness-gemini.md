---
phase: testing
title: harness-gemini test report
description: Coverage and results for the I4 gemini port
---

# I4: harness-gemini testing

## Fixture parity (the oracle)

- Synthetic bundles `matched.json` + `fallback.json` replay
  byte-identical on both sides:
  `vitest src/__tests__/fixtures.test.ts -t gemini_cli` and
  `cargo test -p devkit-harness gemini_adapter_matches_committed_fixtures`.
- `matched.json` covers: hash-dir legacy match (40001), registry-cache
  hit (40002), wrapper suppression + registry-name override on a
  process-only child (40010/40011), plain process-only (40020),
  non-gemini `node` proc dropped (40030), bare `gemini` argv0 dropped by
  the node pool (40040), foreign hash dir skipped (b660bf…), and
  marker-gated slug dir skipped (`mystery-slug` → `/elsewhere`).
- `fallback.json` covers: missing registry session file, wrong-type
  registry row, session file lacking `sessionId` (parse → null),
  wrapper-named process-only.
- Live bundle `live.json` (gitignored): 45 node procs swept, 1 real
  gemini agent (process-only) — replays byte-identical both sides.

## Unit coverage (Rust)

- `is_gemini_executable`: bare/path/node-script/`.exe`; `geminis` and
  `node server.js` rejected.
- `deduplicate`: higher pid replaces in place.
- Parser: upsert+$rewindTo+$set replay, legacy `.json`, missing
  `sessionId` → None.
- Locator: candidate roots walk to `/`, sha256 vs node crypto,
  `matchStringField` escapes/spacing/non-string, `.json`-shadowed-by
  `.jsonl` listing.

## Daemon (live smoke)

- `agent.enriched`: `ported: ["claude","codex","pi","gemini_cli"]`,
  16 agents, 0 live gemini (none running).
- `agent.list`: 21 rows, zero argv0=node rows — the visibility gate
  keeps unclaimed runtime procs out despite the widened sweep.

## Results

- `cargo test --workspace`: 68 tests green; `clippy -D warnings` clean.
- `vitest` agent-manager: 1329 passed.
