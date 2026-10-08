---
phase: requirements
title: Rust coordination daemon (ai-devkitd)
description: Always-on daemon owning coordination — state, events, locking, discovery — per the daemon brainstorm
---

# Requirements — ai-devkitd coordination daemon

## Seed

`/home/ubuntu/code/agent-remote/daemon-brainstorm.md` (steered brainstorm: Rust
from day one, coordination-only scope, ACP parked, production-ready v1). This doc
records the requirements as implemented; deviations are listed in design.

## Problem statement

Every ai-devkit invocation is stateless: each CLI call re-discovers agents by
shelling out to `ps`/`lsof`/`pwdx`, channel bridges each run their own 2s output
poller, and shared state lives in lossy read-modify-write JSON files that race
under concurrent agents (verified: `ChannelConfigRepository`, pi-session-tracker
`sessions.json`). Stale PID files + `kill(pid,0)` liveness can signal the wrong
process after PID reuse.

## Goals (v1, user-felt)

- Instant commands: registry/agent queries answered from a warm cache, not fresh
  process sweeps per invocation.
- Reliable events: one discovery loop; subscribers get persisted, replayable
  `agent.appeared/disappeared` and `registry.changed` events (at-least-once).
- Race-free registries: daemon is the sole writer (SQLite), replacing RMW JSON.
- Zero-ceremony autostart: any client implicitly spawns the daemon on socket
  miss (tmux model); no PID files; socket existence = liveness.
- Resilient by default: every daemon-dependent code path falls back to today's
  file/direct behavior when the daemon binary is absent.

## Non-goals (v1)

- Harness parsing/attribution in the daemon (stays client-side; golden-fixture
  contract prepared for a later port).
- ACP (parked by steering; §7b of the brainstorm is reference only).
- Bridge process supervision, console subscription migration, capacity cache,
  task-manager store absorption — explicitly v1.5+; not built.
- TCP/remote access; multi-user.

## Success criteria

- `cargo fmt/clippy/test` green; nx lint + full nx suite green.
- Registry writes via daemon are serialized and survive concurrent clients.
- `ai-devkit daemon status|start|stop|logs|install` works; autostart spawns in
  <3s without user action; status/logs reflect reality.
