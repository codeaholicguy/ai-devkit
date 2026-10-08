---
phase: testing
title: ai-devkitd test coverage
description: What is tested, how, and what is verified live vs deferred
---

# Testing — ai-devkitd v1

## Rust unit tests (`cargo test`)

`store.rs`:
- `registry_roundtrip` — put/get-all/get-one/delete semantics incl. JSON value
  fidelity and null-on-missing.
- `events_are_ordered_and_replayable` — monotonic seq, `events_after` replay.
- `snapshot_diff_reports_appear_and_vanish` — appear/vanish diff across sweeps.
- `concurrent_sole_writer` — N threads racing registry puts on the same key
  space; all writes land, no lost updates (the property the JSON files lacked).
- `events_survive_reopen` — log persists across store reopen.

`proto.rs`:
- request/response serde roundtrip, missing-params handling, event frame shape
  (`{"event":{seq,ts,kind,payload}}`) — the wire contract clients depend on.

`discover.rs`:
- golden `ps` output fixture parsed through the same filter logic: agent
  binaries kept, noise dropped, basename extraction across paths/args.

`server.rs`:
- end-to-end: real daemon on a temp socket — connect, registry put, subscribe,
  assert replayed + live `registry.changed` frames arrive in order.

## TS tests (`vitest`)

`daemon-client`:
- binary resolution: env override honored, missing paths ignored.
- socket path under `~/.ai-devkit`.
- integration: `ensureDaemon` spawns the real binary (when resolvable via
  `DEVKITD_BIN`, or the legacy `AI_DEVKITD_BIN` alias) and returns a working client; `tryConnect` returns null on
  a missing socket (fallback contract); request/response roundtrip over a real
  unix socket.

`channel-connector` (existing suite, unchanged expectations): custom
`configPath` ⇒ file semantics — daemon path never engaged in tests.

`cli` console migration:
- `agentListSubscription.test.ts` — the seam is unit-tested directly: no-daemon
  → null (caller keeps polling); subscribed → events forwarded + client
  returned; subscribe failure → client closed, null returned.
- Hermeticity: `ensureDaemon` never spawns under `VITEST` unless
  `DEVKITD_BIN` is explicitly set.
- Note: `PreviewActivityIndicator.test.tsx` is dead — vitest's include glob
  covers `*.test.ts` only; .tsx tests never run. Recorded, not fixed here.

## Live-verified (not automated)

`daemon start` autospawn, `status`, `logs -n`, registry roundtrip over socket,
`agent.list` finding a real pi process, subscribe replay + live events.

## Gates run

`cargo fmt`, `cargo clippy` (zero warnings), `cargo test`; `nx run-many -t lint`;
`nx run-many -t test` (all 7 projects).

## Known gaps (honest)

- No test for the SO_PEERCRED path (needs a second uid; manual/CI-later).
- pi-session-tracker socket path exercised only by fallback tests + live use.
- Autostart thundering-herd (N concurrent first-callers) covered by lockfile
  design; load test not automated.
