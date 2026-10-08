---
phase: design
title: ai-devkitd design
description: Unix-socket JSON-RPC daemon; SQLite sole writer; append-only event log; discovery loop; npm-wrapper distribution
---

# Design — ai-devkitd

Seed: daemon-brainstorm.md §7 (final convergence). Coordination only.

## Architecture

- **Transport**: unix socket `~/.ai-devkit/daemon.sock`, line-delimited JSON-RPC
  (`{id, method, params}` → `{id, result|error}`; events as `{"event":{...}}`).
  Mode 0600 + SO_PEERCRED same-uid check (Linux). No TCP. gRPC rejected — no
  remote caller exists.
- **Store**: rusqlite, WAL, daemon sole writer. Tables: `registry(scope,name,
  value)`, `events(seq,ts,kind,payload)` append-only (AUTOINCREMENT seq),
  `agents` snapshot (pid, ppid, tty, command, cwd, session_file, first/last_seen).
- **Events**: mutations emit events (`registry.changed`, `agent.appeared`,
  `agent.disappeared`) appended to the log then broadcast. `subscribe` replays
  persisted events after `afterSeq` then streams live — at-least-once semantics.
- **Discovery**: one `ps -axo` sweep every 2s inside the daemon (replaces
  per-client sweeps); cwd via `/proc/<pid>/cwd` readlink (no lsof spawn).
  Harness attribution deliberately client-side — daemon reports facts.
- **Autostart**: clients call `ensureDaemon()` — try socket, on miss spawn the
  binary guarded by an `O_EXCL` lockfile (single-spawner), wait for socket.
  Optional `ai-devkitd install` writes a systemd --user unit.
- **Distribution**: `rust/` workspace in the monorepo; `@ai-devkit/daemon-client`
  resolves the binary via `AI_DEVKITD_BIN` → `@ai-devkit/daemon-<plat>-<arch>`
  optional-dep package → `~/.ai-devkit/bin/ai-devkitd` → dev `rust/target/`.

## Verbs

`ping`, `daemon.status`, `registry.get|put|delete` (scope-parametrized;
`channels`, `pi-sessions`), `agent.list`, `subscribe` (params.afterSeq),
`events.replay`, `shutdown`.

## Deviations from the brainstorm report

- v1.5 items not built (bridge supervision, console/bridge subscription
  migration, capacity cache, task-manager absorption) — per sequencing; reviewer
  holds the scope call.
- `agent list` CLI was NOT rewired to the daemon cache: attribution/session-file
  knowledge is client-side by design, so the fast path needs the phase-2
  knowledge port to pay off. Daemon serves `agent.list` facts; CLI still does
  its own discovery today.
- Daemon discovery reads `/proc` directly instead of porting `lsof`/`pwdx`
  shell-outs — same facts, fewer processes spawned.
- pi-session-tracker cannot be absorbed (runs inside pi); it is a daemon-first
  writer with JSON fallback, matching the report's "store absorbed" variant.

## Security

Socket 0600 in user home, SO_PEERCRED uid equality, no TCP, channel tokens never
leave the same-uid boundary. memory-dashboard's unauthenticated-bind lesson
applied: nothing binds a network interface.
