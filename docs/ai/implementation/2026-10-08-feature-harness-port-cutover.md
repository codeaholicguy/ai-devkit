---
phase: implementation
title: harness-port-cutover implementation + efficiency report
description: I12 — final daemon-primary cutover and the port metrics
---

# I12: cutover + efficiency report

## Shipped

- `channel-runner.ts`: `fetchEnrichedAgents` wired into its
  `AgentManager` (was the only consumer still on the local-only
  path). All call sites — `agent` CLI commands, the TUI console,
  channel bridges — now consult the daemon first and keep the local
  adapter path strictly as fallback.
- Cutover state: `ported` = all ten types → `listAgents` performs
  zero local detection when devkitd answers. `status` readiness is
  likewise daemon-primary (I11).

## Efficiency report

### Per-adapter LOC (TS harness dir → Rust module)

| type | TS LOC | Rust LOC | notes |
|---|---|---|---|
| claude | 1527 | 878 | largest session format |
| codex | 1863 | 1273 | registry + date-dir discovery |
| pi | 1554 | 921 | sqlite-ish tracker + legacy matching |
| gemini_cli | 1098 | 1029 | log replay incl. rewind/set events |
| copilot | 762 | 694 | lock dirs + workspace yaml |
| grok_cli | 588 | 369 | transcript mtime-driven |
| opencode | 506 | 332 | sqlite session/message/part |
| devin | 769 | 503 | sqlite + lock files + acp |
| kiro | 696 | 515 | locks + jsonl transcripts |
| antigravity_cli | 487 | 331 | cwd-keyed registry + transcript fold |
| **adapters total** | **9850** | **6845** | ~30% smaller in Rust |
| shared engine | (shared.ts ~700) | shared.rs 736 + lib.rs 261 | registry/sweep/fold |
| readiness | 877 | 1365 | incl. fixture host; regex dep added |

### Fixture corpus + parity defects found

- 19 committed harness bundles (2–3 per type; live captures stay
  gitignored) + 2 readiness bundles, all replayed byte-identical on
  both sides.
- Parity defects surfaced by the oracle, fixed during the port:
  `.exe` basename normalization asymmetry (I10), `readdirSync`
  sorted-order vs Rust FS order (I9), `is_idle` float vs floor
  window (I3), float `mtimeMs` (I8), cwd-less `processOnlyAgent`
  crash latent in TS (I7, fixed in shared.ts), fixture temp-dir and
  registry-seeding races.

### Daemon overhead + latency (debug build, live machine)

| metric | value |
|---|---|
| devkitd RSS under 2s sweep loop | ~74 MB (85 MB peak during sweep) |
| devkitd CPU | ~7% while sweeping |
| `agent.enriched` warm RPC | **0.4 ms/call** (cached result) |
| `listAgents` local-only path | ~238 ms/call |
| effective speedup | daemon answers in-process-cache reads ~600x faster; the sweep cost is paid off-path once per 2s instead of per caller |
| `agent.readiness` | ~10 reports computed on demand (sub-second) |

### Structural wins beyond latency

- One `ps` sweep serves every consumer (console, CLI, bridges) —
  previously each ran its own `ps` + per-adapter session I/O.
- Events (`agent.appeared`/`disappeared`, `registry.changed`) are
  daemon-emitted, so consoles subscribe instead of poll-diffing.
- Fixture replay gives a standing cross-language oracle — new
  adapters port with the same bundle mechanism.

## Test evidence

- `cargo test --workspace` 82 green; `clippy -D warnings` clean.
- `vitest` agent-manager 1345, cli 1320 green.
- `agent list --json` returns the same type set with and without the
  daemon; `status` identical daemon-primary vs local fallback.
