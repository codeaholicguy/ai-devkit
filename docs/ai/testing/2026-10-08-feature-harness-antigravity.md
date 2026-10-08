---
phase: testing
title: harness-antigravity test report
description: Coverage and results for the I10 antigravity port
---

# I10: harness-antigravity testing

## Fixture parity (the oracle)

Two bundles replay byte-identical TS↔Rust (`vitest -t antigravity`,
`cargo test antigravity_adapter_matches`):

- `matched.json` (8 agents) — waiting (last record PLANNER_RESPONSE),
  running (USER_INPUT last while MAX `created_at` sits on an earlier
  line), idle (no timestamps → mtime fallback via `mtimes`);
  `<USER_REQUEST>`-wrapped extraction vs unwrapped prompt; `content`
  as string and as `[{text}]` blocks; registry pointing at a missing
  transcript → process-only; unregistered cwd → process-only; empty
  cwd key, empty id, and non-string id registry rows skipped;
  `agy.exe` accepted by the pool (`.exe` normalization); `agy --verbose`
  canHandle; `notagy` invisible; untruncated `lastUserMessage` summary.
- `fallback.json` (2 agents) — malformed `last_conversations.json` →
  all process-only; cwd-less → `unknown-<pid>`.

## Cross-adapter regression check

The `.exe` normalization fix to `matches_executable_name` changes pool
membership only by widening it (`*.exe` procs now enter `relevant`,
matching TS); all committed fixtures for the other nine adapters still
replay byte-identical (63 harness tests green).

## Results

- `cargo test --workspace`: 81 tests green; `clippy -D warnings` clean.
- `vitest` agent-manager: 1343 passed.
- Live daemon smoke: `ported` =
  `["claude","codex","pi","gemini_cli","copilot","grok_cli","opencode",
  "devin","kiro","antigravity_cli"]` — the full set.
