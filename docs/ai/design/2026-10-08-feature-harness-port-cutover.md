---
phase: design
title: harness-port-cutover design
description: I12 — what daemon-primary means now that all types are ported
---

# I12: cutover — design

## State at cutover

`AgentManager.listAgents` (packages/agent-manager/src/AgentManager.ts)
already implements the split: `fetchEnrichedAgents` → daemon-cached
sweep results for every type in `ported`; local `detectAgents` runs
only for types NOT in `ported`, or everything when the RPC fails.
With `ported` now covering all ten harnesses, the local path is a
pure fallback — no code deletion required, matching the epic's "flip
preference, not capability".

## Remaining gap closed

`channel-runner.ts` constructed a bare `new AgentManager()` without
`fetchEnrichedAgents` — bridge processes did full local detection on
every 2s poll. Now wires the same `ensureDaemon` + `enrichedAgents`
fetch used by `commands/agent.ts`. Every consumer (agent CLI
commands, console via `useAgentList`, channel bridges) is
daemon-primary.

## Metrics methodology

- LOC: `wc -l` per `src/harnesses/<type>/` (TS, excluding
  `credentials.ts` — out of scope) vs `src/<type>/` (Rust); shared
  engine LOC counted separately.
- Fixtures: committed bundles per type (live captures excluded).
- Latency: `enrichedAgents` RPC (warm socket) vs full local
  `listAgents` with daemon disabled.
- Daemon overhead: RSS + %CPU on a live 2s sweep loop, debug build.
