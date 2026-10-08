# Epic Plan — Daemon-Owned Enriched Agent State (harness knowledge port)

Date: 2026-10-08
Branch: `feature-devkitd-monorepo` (iterate with frequent commits here)
Epic owner: Devin

## Goal

Move the "fat part" — per-harness process→session attribution and enrichment
(`AgentManager.listAgents` adapter logic, ~11k LOC across 11 harnesses) — from
TypeScript into the `devkitd` daemon in Rust, so every `ai-devkit` surface
(`agent list`, console TUI, bridges) becomes a thin client of `agent.enriched`.

Second goal: measure how efficient the Rust port is (dev cost per harness,
runtime cost per sweep, parity-defect rate) to validate the daemon-in-Rust
direction.

## Execution model

One iteration per harness (plus foundation and cutover). Each iteration runs
the full dev lifecycle (requirements → design → planning → implementation →
testing → review) and ends in a commit on this branch. Lifecycle docs follow
the repo convention `docs/ai/<phase>/2026-10-08-feature-harness-<name>.md`.

## Iterations

| # | Scope | Feature slug | Exit criteria |
|---|-------|--------------|---------------|
| I0 | Foundation: fixture tool, `devkit-harness` crate, `agent.enriched` RPC + ts-rs schema, TS fallback client | `harness-port-foundation` | daemon serves enriched schema; client falls back; fixtures dump for all 11 harnesses | ✅ `545625dd`
| I1 | claude (1649 LOC, transcript parsing — hardest first) | `harness-claude` | fixture parity 100% | ✅ `12b6ded2`
| I2 | codex (1944) | `harness-codex` | parity | ✅ `7cfecd9b`
| I3 | pi (1683) | `harness-pi` | parity | ✅ `71358904` |
| I4 | gemini (1098) | `harness-gemini` | parity | ✅ `48fc9a87` |
| I5 | copilot (762) | `harness-copilot` | parity | ✅ `22d6fd2f` |
| I6 | grok (588) | `harness-grok` | parity | ✅ `8298101a` |
| I7 | opencode (506) | `harness-opencode` | parity | ✅ `cdf1cc6c` |
| I8 | devin (857) | `harness-devin` | parity | ✅ `d788bf6c` |
| I9 | kiro (696) | `harness-kiro` | parity | ✅ `9c0e9ba5` |
| I10 | antigravity (487) | `harness-antigravity` | parity | ✅ `d7de3221` |
| I11 | readiness — shared lib, `devkit-harness::readiness` internal + `agent.readiness` RPC + status daemon-primary | `harness-readiness` | fixture parity | ✅ `c42b79cf` |
| I12 | Cutover + efficiency report | `harness-port-cutover` | `agent list` daemon-primary; local adapters = fallback only; metrics table published | ✅ `b7402c32` |

Order rationale: claude/codex/pi first — highest usage and hardest parsing, so
port-cost and risk data arrive early enough to change the plan.

## Cross-cutting decisions (locked unless an iteration surfaces reason)

- Parity oracle: golden fixtures produced BY the TS implementation; Rust must
  match byte-for-byte on `AgentInfo` fields.
- Wire schema: `AgentInfo` defined in Rust (`devkit-core`/`devkit-harness`),
  `ts-rs` generates the TS type — same pattern as `Request`/`Response`/`Event`.
- Fallback: `agent.enriched` missing/failing → current TS adapter path. Never
  a hard break; cutover flips preference, not capability.
- Harness-agnostic helpers (`shared.ts`, `readiness/`, `utils/process.ts`,
  `utils/matching.ts`) port once into `devkit-harness` during the first
  iteration that needs them — I1 (claude) at latest.
- Out of scope for all iterations: `getConversation` (detail view),
  `findSessionsById`, historical session listing, resume commands,
  `resolveHerdrPanes`. Revisit at cutover.

## Metrics collected per iteration (feeds I12 report)

- Rust LOC / files per adapter vs TS baseline
- Fixture count + parity defect count (TS↔Rust mismatches found)
- daemon RSS/CPU per 2s sweep as adapters land
- `agent list` latency daemon-path vs local-path

## Risks

- Fixture corpus misses edge cases → parity is overfit. Mitigate: seed
  fixtures from real `~/.claude|~/.codex|...` session trees (sanitized), plus
  adapter unit-test cases.
- Harnesses whose session format is undocumented/unstable → port may embed
  wrong assumptions. Mitigate: fixtures capture observed behavior, not spec.
- Long branch lifetime → rebase pain. Mitigate: frequent small commits,
  keep `feature/rust-daemon` ancestry untouched.
