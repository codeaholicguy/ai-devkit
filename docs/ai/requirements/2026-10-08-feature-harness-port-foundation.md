---
phase: requirements
title: Requirements & Problem Understanding
description: Foundation for the harness knowledge port — fixtures, wire contract, devkit-harness crate, TS fallback
---

# Requirements — Harness Port Foundation (I0)

Epic: `docs/ai/planning/2026-10-08-epic-harness-port.md`
Iteration: I0 of the harness-port epic.

## Problem Statement

`ai-devkit agent list`, the console TUI, and every other consumer of agent
state run the same ~11k LOC TypeScript attribution/enrichment pipeline
(`agent-manager` harness adapters): scan processes, match each to a session
file, parse harness-specific JSONL transcripts, derive status/summary/cwd.

Every CLI invocation repeats all of it; every console instance duplicates it;
two consoles can render different views of the same agent. The daemon exists
but is "coordination-only": its `agent.list` returns raw `ps` rows that no
client consumes.

The epic goal is daemon-owned enriched agent state. I0 builds only the
foundation that every subsequent per-harness iteration needs — no adapter is
ported in this iteration.

## Goals & Objectives

Primary:
- A parity oracle: a fixture tool that records `{process snapshot + session
  files} → AgentInfo[]` from the current TS adapters, usable as
  byte-for-byte test expectations for the Rust port.
- A `devkit-harness` Rust crate with an adapter trait mirroring
  `canHandle`/`detectAgents`, plus the wire schema for enriched agents.
- An `agent.list` RPC on `devkitd` returning `AgentInfo[]` for the
  harness types it has ported (initially none/empty), including which types
  it covers so clients can fall back per-harness.
- `daemon-client` consumes `agent.list` for ported types and falls back
  to local adapters for the rest — incremental cutover, never a break.

Secondary:
- ts-rs generated TS types for the enriched schema (same pipeline as
  `Request`/`Response`/`Event`).
- Metrics scaffolding: record Rust LOC / fixture counts per iteration for
  the epic's I12 efficiency report.

Non-goals:
- Porting any harness adapter (I1+).
- `getConversation`, `findSessionsById`, historical session listing, resume
  commands, `resolveHerdrPanes` — stay TS-side; revisit at cutover.
- Cron/scheduler work in the daemon.
- Changing `agent.list` (raw rows stay for cheap consumers).

## User Stories & Use Cases

- As the Rust porter, I want recorded adapter outputs for known inputs so
  that parity is a test assertion, not an eyeball.
- As a CLI/console developer, I want one RPC that returns ready-to-render
  `AgentInfo[]` so that rendering logic lives nowhere in the client.
- As an operator mid-epic, I want unported harnesses to keep working through
  the TS path so that partial rollout is invisible.
- As the daemon, I want to enrich once per discovery sweep so that N clients
  never multiply parse work.

Edge cases:
- Daemon returns `ported: []` (I0) → clients use the full local path; no
  behavior change.
- Daemon absent/binary missing → same local fallback as today.
- `agent.list` errors mid-call → fall back for the whole call, not
  per-agent.

## Success Criteria

- Fixture tool emits deterministic JSON bundles and round-trips TS↔TS
  identically. Live-captured bundles stay local-only (gitignored — real
  transcripts are private); committed synthetic fixtures are authored
  per-harness in I1+.
- `devkit-harness` compiles with the adapter trait + `EnrichedAgent` type;
  `cargo test` includes a trait-level smoke test.
- `agent.list` round-trips over the socket: response contains
  `{agents: AgentInfo[], ported: string[]}`; `ported` empty in I0.
- Generated `packages/daemon-client/src/gen/EnrichedAgent.ts` (etc.) exists
  and `client.enrichedAgents()` returns it.
- `listAgents` path unchanged end-to-end: cli/agent-manager/console tests
  green with zero modification.
- `cargo fmt/clippy/test`, `nx run-many -t lint,test,build` all green.

## Constraints & Assumptions

- Wire schema must mirror `AgentInfo` field-for-field (names, optionality,
  JSON casing) — clients diff-compare; renaming is out of scope.
- Enrichment is cached per discovery sweep (daemon already sweeps every 2s);
  we do not re-parse JSONL per RPC call.
- Fixtures live in `fixtures/harness/` at repo root and are committed.
- ts-rs numeric fields stay `number` on the wire (established in
  devkitd-monorepo work).
- Assumption: session-file parsing is filesystem-only and safe to run inside
  the daemon process — no adapter does network calls during `detectAgents`.
  (Verified per adapter in I0 design.)

## Questions & Open Items

- Where `EnrichedAgent` schema lives: `devkit-core` (wire types) vs
  `devkit-harness` (domain types) — decide in design; leaning devkit-core so
  devkitd never needs the harness crate just for the RPC type.
- `readiness/` (~515 LOC) is a shared lib, not a harness — fold its port into
  the first adapter that needs it (I1 claude likely). Confirmed: it is not a
  standalone adapter.
- Fixture determinism: `lastActive: new Date()` in adapters → freeze clock
  in the capture tool; file mtimes normalized to recorded values.
- Agent registry merge (names, pinned, prune) — stays client-side or moves
  to daemon? Decide in design; leaning daemon-side since the registry is
  already daemon-owned state.
