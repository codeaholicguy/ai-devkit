---
phase: implementation
title: Implementation Guide
description: Guide the implementation with detailed technical specifications
---

# Implementation Notes

What shipped for `feature-muse-adapter` (v1 vertical slice, `agent-manager` only).

## Changed files

- `packages/agent-manager/src/harnesses/muse/MuseSessionParser.ts` (new): framed-transcript
  parsing (direct / `record_json` / `retained_frame` children), `payload_type` dispatch,
  µs→ms timestamps, incremental cache + tail reader reuse.
- `packages/agent-manager/src/harnesses/muse/MuseSessionLocator.ts` (new): runtime-file PID
  matching with birthtime staleness guard, dated-archive walk with UUID filter, legacy
  cwd+birthtime fallback via bounded metadata head-reads.
- `packages/agent-manager/src/harnesses/muse/MuseAgentMapper.ts` (new): project-named
  agents, last-prompt summaries, parser-derived status.
- `packages/agent-manager/src/harnesses/muse/MuseAdapter.ts` (new): `type "muse"`,
  `processNames ["muse"]` + `processNamePrefixes ["muse"]`, precise `canHandle`.
- `packages/agent-manager/src/harnesses/muse/readiness.ts` (new): config dir
  `.config/muse`, auth probe on `auth.json` presence.
- Shared discovery extension: `AgentAdapter.processNamePrefixes`, prefix matching in
  `utils/process.ts` (capture, filter), threaded through `AgentManager`,
  `harnesses/shared.ts`, `fixtures/capture.ts`. Existing adapters pass no prefixes, so
  their capture call shapes are byte-identical (verified by untouched mock assertions).
- Registration: `AGENT_TYPES` + `createBuiltinAdapters` + `READINESS_PROFILES.muse` +
  `HARNESS_RUNTIME_PROFILES.muse` (`matchArgv0Name("muse")`, command `muse`).
- Tests: 4 new muse suites (20 tests) + prefix tests + runtime-profile case + muse
  readiness cases; updated readiness keys, fixture bundles
  (`fixtures/harness/muse/matched|fallback.json`), readiness fixtures
  (healthy/degraded muse entries).
- Deliberately NOT created: `muse/credentials.ts` (no token consumer; auth probe reads
  `auth.json` directly like the pi pattern).

## Decisions and deviations

- T1 spike picked the hand-written framed parser over `muse export`: 0.37s in-process vs
  0.51s + subprocess + 13MB temp file + sensitive reasoning bundle.
- Staleness guard compares process start against transcript birthtime (runtime files carry
  no start timestamp).
- First-user-message may come from any pre-skip line (Claude semantics); session start
  from the first line only.
- Fixture timestamps: matched bundle uses `$NOW` starts (birthtime-coupled) with `$TODAY`
  day dirs; fallback uses a frozen clock.

## Edge cases handled

0600 files skipped, malformed runtime entries ignored, non-UUID dirs excluded, `subagent/`
and logs never match (require `session.jsonl`), verbatim id round-trip, empty transcripts
return null.

## Minor deviation from design

Design mentioned an mtime cache for the archive walk; not implemented — walks are
readdir-only and bounded like Claude's `discoverHistoricalSessionFiles`. Add caching only
if profiling shows refresh cost.

## Cross-package fallout (found via CLI build)

Adding `muse` to `AGENT_TYPES` broke the CLI build: `AGENT_TYPE_LABELS` and
`AGENT_TYPE_LABELS_COMPACT` in `packages/cli/src/util/agent.ts` are exhaustive
`Record<AgentType, string>`. Added `muse: "Muse Code"` / `muse: "muse"`. This also
made muse startable in the console start pane and listable in `--type` filters and
status reports (all automatic via the runtime profile); updated those list-membership
tests. Spawning `muse` from the console works through the profile command, so no
exclusion mechanism was added.

## Rust `devkitd` detection parity (added scope)

- `rust/crates/devkit-harness/src/muse/{mod,locator,parser}.rs`: framed-transcript fold
  (envelope/children unwrap, µs timestamps, intent/assistant/approval/input signals),
  runtime-file PID matching with birthtime staleness guard, dated-archive walk, legacy
  cwd+birthtime join; status mirrors TS exactly (no idle override).
- `shared.rs`: `matches_executable_prefix`; `devkit-core/discover.rs`: daemon pool gate
  admits `muse`/`muse-*` basenames (precision stays in `can_handle`).
- Wiring: `lib.rs` module + `default_registry` + parity test.
- Golden fixtures `fixtures/harness/muse/*` replay byte-identical through the Rust port;
  `cargo test` 70 + 16 green, clippy clean. `cargo fmt` drift is repo-wide pre-existing
  (newer local rustfmt); new code matches surrounding style, no reformatting.
- Deliberately NOT ported: conversation reads, incremental cache, display names, model
  ids, history listing, readiness checks (daemon surface is detect-only).

## v2 handoff

Send transport (endpoint socket vs `session-message` CLI), runtime-file exit cleanup,
status-heuristic refinement, Rust `devkitd` mirror, CLI status surfacing.
