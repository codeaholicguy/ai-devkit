---
phase: requirements
title: Rust coordination daemon (ai-devkitd)
description: Always-on single-binary daemon owning coordination — state, events, locking, discovery — with thin TS clients and an event-driven console
---

# Requirements — ai-devkitd coordination daemon

## Problem statement

Every ai-devkit invocation is stateless. The CLI re-discovers agents on every
call by shelling out to `ps`/`lsof`/`pwdx` (`agent-manager/src/utils/process.ts`),
the TUI console re-runs `manager.listAgents` on a blind 3-second interval
(`cli/src/tui/console/hooks/useAgentList.ts`), each channel bridge runs its own
2-second output poller with no in-flight guard
(`cli/src/services/channel/channel-runner.ts`), and shared state lives in
read-modify-write JSON files that lose updates under concurrent agents:

- `channel-connector/src/ChannelConfigRepository.ts` — read→mutate→write of
  `~/.ai-devkit/channels.json` with no lock; a corrupt file silently returns the
  empty default and can then be written back, wiping real config.
- `pi-session-tracker/extensions/index.ts` — same pattern for
  `~/.pi/agent/sessions.json`; two pi agents starting together lose an entry.
- Channel bridge liveness is a PID file + `kill(pid, 0)`
  (`cli/src/services/channel/channel.service.ts`) — after PID reuse, `stop` can
  signal an unrelated process.

A single always-running daemon that owns coordination (state, events, locking,
process discovery, IPC) removes the race class structurally and serves every
client from one warm cache and one event stream.

## Decisions already made (recorded here in full)

- **Language**: Rust, from day one. The daemon is coordination-only, so it does
  not need the TS harness knowledge that would make Rust expensive; a single
  static binary has no runtime drift and needs no `npm install`.
- **Scope boundary**: the daemon owns coordination facts only — pids, cwds,
  commands, registries, events. Harness-specific knowledge (session-file
  location, conversation parsing, model attribution) stays client-side in TS
  for v1 and ports later under a golden-fixture contract.
- **ACP (Agent Client Protocol)**: parked. Not in the v1 wire protocol.
- **v1 is user-experience-complete**, not an architectural kernel: what ships
  must be felt — instant commands, live agent state, reliable events,
  zero-ceremony autostart — including the console becoming event-driven.

## Goals (v1, user-felt)

- **Instant commands**: registry/agent queries answered from a warm daemon
  cache, not fresh process sweeps per invocation.
- **Live agent state**: one discovery loop inside the daemon emits
  `agent.appeared` / `agent.disappeared`; the TUI console subscribes to these
  events and refreshes on change instead of blind polling.
- **Reliable events**: events persist in an append-only log; subscribers ack by
  sequence number and replay (`afterSeq`) after reconnect — at-least-once.
- **Race-free registries**: the daemon is the sole writer to a SQLite store;
  the channels and pi-sessions registries migrate to it.
- **Zero-ceremony autostart**: any client implicitly spawns the daemon on
  socket miss (tmux model). No PID files — socket existence is liveness.
- **Resilient by default**: every daemon-dependent path falls back to the
  existing behavior when the daemon binary is absent — the console falls back
  to interval polling, registries fall back to JSON files.

## Console migration (in scope for v1)

`useAgentList` gains a daemon subscription: `agent.appeared` /
`agent.disappeared` / `registry.changed` events trigger an immediate refresh,
and the blind 3s interval relaxes to a slow fallback (attribution drift still
needs `manager.listAgents`, since harness attribution is client-side). With no
daemon the hook behaves exactly as today. The user-visible change: agents
appear/disappear in the console when they actually appear/disappear, not on
the next poll tick.

## Channel bridges (fast-follow, partially in scope)

Bridges already write/read registry state through the daemon (absorbed in the
base work). Their 2s JSONL output polling is harness-specific parsing and stays
client-side by design. Bridge process *supervision* (daemon as parent, killing
the stale-PID class structurally) is deferred to v1.5.

## Non-goals (v1)

- Harness parsing/attribution inside the daemon.
- ACP northbound or southbound.
- Bridge supervision, capacity caching, task-manager store absorption (v1.5+).
- TCP/remote access, multi-user, TLS, auth tokens.
- Daemon ownership of git operations, releases, skills, agent-side hooks.

## Success criteria

- `cargo fmt`, `cargo clippy` (zero warnings), `cargo test` green.
- `nx lint` and the full `nx test` suite green.
- Registry writes via the daemon are serialized and survive concurrent clients
  (test: 32 threads racing puts, no lost updates).
- `ai-devkit daemon status|start|stop|logs|install` works; autostart brings the
  daemon up without user action in under ~3s.
- Console refreshes on daemon events when present and polls as before when not
  (both paths tested).
- A daemon-free environment behaves exactly as before.
