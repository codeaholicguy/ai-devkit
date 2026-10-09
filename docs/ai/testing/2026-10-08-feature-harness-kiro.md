---
phase: testing
title: harness-kiro test report
description: Coverage and results for the I9 kiro port
---

# I9: harness-kiro testing

## Fixture parity (the oracle)

Two bundles replay byte-identical TS↔Rust (`vitest -t kiro`,
`cargo test kiro_adapter_matches`):

- `matched.json` (9 agents) — lock→outermost-ancestor via `kiro-cli-chat`
  holder; direct lock; broken ppid chain → sole-kiro-tty fallback; two
  kiros on one tty → lock unclaimed; `??` tty holder → none;
  `node /x/kiro-cli.js` script canHandle; `node /x/other.js` invisible;
  lock without `.jsonl` → process-only; malformed `{pid:` and
  `{"pid":"abc"}` locks skipped; string `"1101"` pid → second agent on
  the same proc; metadata `session_id` override + empty `cwd` → proc-cwd
  fallback; `updated_at` precedence, `meta.timestamp` epoch and direct
  ISO `timestamp` forms, mtime fallback; waiting/running/idle;
  lastUserMessage/title/`"Kiro session active"` summary chain.
- `fallback.json` (3 agents) — no sessions dir → all process-only; bun
  script kiro; cwd-less proc → `unknown-<pid>`.

## Cross-adapter regression check

`list_dir_names` sorts all `safeReaddir` mirror sites — every committed
fixture bundle for all 9 ported adapters still replays byte-identical
(61+1 harness tests green), confirming the sort only fixes latent
ordering exposure (it surfaced first via kiro's lock-ordered output).

## Results

- `cargo test --workspace`: 80 tests green; `clippy -D warnings` clean.
- `vitest` agent-manager: 1341 passed.
- Live daemon smoke: `ported` includes `kiro` (no live kiro procs on the
  machine — `agents` kiro count 0, expected).
