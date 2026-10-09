---
phase: testing
title: harness-claude test report
description: Coverage and results for the I1 claude port
---

# I1: harness-claude testing

## Results (all green)

| Suite | Result |
|---|---|
| `cargo test --workspace` | 33 passed (15 core, 15 harness, 3 daemon) |
| `cargo clippy --workspace -D warnings` | clean |
| `fixtures.test.ts` (vitest) | 3 passed, 1 skipped |
| `AgentManager.test.ts` | 65 passed (incl. 5 new merge-path tests) |
| Live smoke | `agent list` auto-spawned devkitd; `enrichedAgents()` returned `ported: ["claude"]` + 4 real agents matching local-rendered rows |
| Typecheck | agent-manager, cli, daemon-client `tsc --noEmit` clean |

## Parity oracle

Bundles `fixtures/harness/claude/{matched,statuses}.json` replay byte-identical
under **both** the TS fixture harness and the Rust `fixtures::assert_parity`
test; the gitignored `live.json` (real machine capture, 4 agents) also matches
on both sides.

Coverage proven by the bundles:

- resume matching via `--resume <uuid>` → session JSONL
- PID-file matching incl. `waitingFor` summary suffix and status override
- stale PID-file rejection (>60s start delta) → legacy fallback
- legacy greedy cwd+birthtime matching (3min window)
- process-only fallback (`pid-<pid>` session id, running status)
- running / waiting / idle / unknown status mappings
- noise filtering (`[Request interrupted`, `Tool loaded.`, continued-session)
- first-user-message summary + command-message argument extraction
- `$NOW` sentinel → deterministic birthtime for legacy matching on replay

## Merge-path unit tests (AgentManager)

- ported type → daemon row used, local adapter `detectAgents` never called
- unported type → local adapter still runs alongside daemon agents
- `fetchEnrichedAgents` → `null` → all-local
- `fetchEnrichedAgents` throws → all-local
- daemon rows with `type` not in `ported` are dropped

## Known gaps (accepted for I1)

- No incremental JSONL parse caching — cold head+tail scan each sweep.
- `getConversation`/session-list APIs unported.
- CLI output equivalence daemon-vs-local is asserted via fixture parity plus
  live smoke, not an automated A/B harness test.
