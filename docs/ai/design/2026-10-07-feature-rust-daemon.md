---
phase: design
title: ai-devkitd design
description: Unix-socket JSON-RPC daemon; SQLite sole writer; append-only event log; single discovery loop; tmux-style autostart; npm binary distribution
---

# Design — ai-devkitd

## Architecture overview

`ai-devkitd` is a single static Rust binary that owns coordination: shared
state, event distribution, process discovery, and IPC. Everything else —
harness-specific detection and parsing, channel message formatting, TUI
rendering — stays in the TypeScript clients. The daemon never needs to know
what a "codex session file" is; it knows pids, cwds, commands, registries, and
events. That boundary is deliberate: it is what lets the daemon be Rust without
dragging the TS adapter layer along, and it keeps the wire schema
harness-agnostic so a later port of parser knowledge doesn't force protocol
changes.

## IPC contract

- Transport: unix domain socket at `~/.ai-devkit/daemon.sock`, mode `0600`,
  same-uid enforcement via `SO_PEERCRED` on Linux (permissive cfg fallback on
  other platforms, where the 0600 socket still applies).
- Framing: one JSON object per line, both directions. Request
  `{id?, method, params?}`; response `{id?, result?}|{id?, error?}` (absent
  fields omitted, never `null`); event frame `{"event": {seq, ts, kind,
  payload}}`.
- gRPC and localhost HTTP were rejected: no remote caller exists, TCP is a
  security regression for a same-user coordination bus, and the
  memory-dashboard unauthenticated-bind lesson says don't listen on the
  network for local-only state.

### Methods

| Method | Params | Result |
|---|---|---|
| `ping` | — | `{pong, startedAt}` |
| `daemon.status` | — | `{version, startedAt, socket}` |
| `registry.get` | `{scope, name?}` | single value, or `{name: value}` map for the scope |
| `registry.put` | `{scope, name, value}` | `{ok}` |
| `registry.delete` | `{scope, name}` | `{ok}` |
| `agent.list` | — | array of fully attributed `AgentInfo` rows — authoritative for all harness types |
| `subscribe` | `{afterSeq?, liveOnly?}` | ack `{subscribed}`, then event frames; replays persisted events after `afterSeq` first unless `liveOnly` |
| `shutdown` | — | `{ok}`; daemon exits after the response flushes |

Registry scopes in use: `channel-bridges` (channel.service — live bridge
process registry), `test` (integration tests). Channel config was
briefly routed through the registry but reverted — `~/.ai-devkit/channels.json`
stays the owner of channel credentials; the registry holds non-secret
coordinated state only.

## State: SQLite, daemon sole writer

rusqlite (bundled), WAL journal, `synchronous=NORMAL`. Three tables:

- `registry(scope, name, value)` — absorbs the RMW JSON registries. All writes
  serialize through the daemon's single connection behind a mutex, so the
  lost-update class the JSON files had is eliminated structurally — there is
  literally no code path where two clients can each hold a stale copy.
- `events(seq, ts, kind, payload)` — append-only log; `seq` is AUTOINCREMENT.
  This is the pub/sub substrate: subscribers ack by `seq`, replay survives
  daemon restarts, and the log doubles as an audit trail.
- `agents(pid, ppid, tty, command, cwd, session_file, first_seen, last_seen)` —
  the discovery snapshot. `session_file` exists in the schema but is
  unpopulated: session-file resolution is harness knowledge, client-side by
  design.

## Events

Mutations append to `events` and publish to a `tokio::broadcast` channel.
`subscribe` first drains persisted events with `seq > afterSeq` (at-least-once
across reconnects), acks, then streams live frames. Kinds:
`agent.appeared`, `agent.disappeared`. Lifecycle payloads carry
`{pid, agents: EnrichedAgent[]}` — appeared looks up the fresh sweep cache,
disappeared the previous one (last-known info; unattributed procs get `[]`).

## Discovery loop

One `ps -axo pid=,ppid=,tty=,command=` sweep every 2s inside the daemon —
replacing the per-invocation sweeps every client ran before. Filtering is by
executable basename against the harness binary list (`claude`, `codex`,
`gemini`, `copilot`, `grok`, `opencode`, `pi`, `kiro-cli-chat`, `devin`, `kimi`,
`cursor-agent`, `droid`). Cwd comes from `/proc/<pid>/cwd` — one syscall, no
`lsof`/`pwdx` spawn. Each sweep diffs the snapshot and emits appear/vanish
events. Known limitation: wrapper-launched agents (`node codex-linux.js`)
aren't matched by basename — recorded for the phase-2 knowledge port.

## Autostart and lifecycle

tmux-style implicit spawn, implemented in `@ai-devkit/daemon-client`:
`ensureDaemon()` tries the socket; on miss it takes an `O_EXCL` lockfile
(single spawner; locks older than 30s are reclaimed so a crashed starter can't
wedge autostart), spawns `devkitd serve` detached with output appended to
`~/.ai-devkit/daemon.log`, and polls the socket for readiness (≤3s). Socket
existence is liveness — no PID files, so the stale-PID/`kill(pid,0)` hazard
class cannot recur here. `devkitd install` writes a systemd `--user` unit
for boot persistence; the daemon also runs fine with pure implicit spawn.

## Distribution

Rust lives in `rust/` inside the monorepo. npm keeps shipping the JS `ai-devkit`
bin; `@ai-devkit/daemon-client` resolves the daemon binary in order:
`DEVKITD_BIN` env → `@ai-devkit/devkitd-<platform>-<arch>` optional-dep
package (esbuild-style per-platform binary packages; the packages themselves
are wired in the release workflow later) → `~/.ai-devkit/bin/devkitd` →
`rust/target/{release,debug}/devkitd` in a dev checkout. Nothing found ⇒
callers degrade to pre-daemon behavior.

## The five settled decisions

1. **Absorb vs coexist**: end state is one `ai-devkitd`. Channel bridges become
   socket clients now, supervised children in v1.5. pi-session-tracker can't be
   absorbed (it runs inside each pi process) — its *store* is absorbed instead:
   the extension is a daemon-first writer with JSON fallback. memory-dashboard
   keeps its UI but must not hold its own writer connection to the daemon DB.
   Never two daemons side by side.
2. **Autostart**: implicit spawn + optional systemd `--user` unit, as above.
3. **Events**: persisted append-only log + at-least-once subscribers. Caveat
   kept explicit: this covers "what happened" and replay; it does not subsume
   task-manager's *transactional multi-row writes* — that absorption needs a
   schema review before it's claimed.
4. **Packaging**: `rust/` workspace + npm wrapper + per-platform binary
   optional deps, as above.
5. **Knowledge port**: golden-file corpus extracted from the TS parsers is the
   drift-proof contract — captured session files + expected outputs per
   harness, run against both implementations, crate-by-crate. The corpus itself
   is v1.5+ work; the v1 discipline it enforces (harness-agnostic wire schema)
   is already applied.

## Console subscription migration (v1 scope)

`useAgentList` (`cli/src/tui/console/hooks/useAgentList.ts`) currently re-runs
`manager.listAgents` every 3s regardless of whether anything changed. Migrated
design: on mount the hook calls `DaemonClient.tryConnect` / `ensureDaemon`; on
success it `subscribe`s and each `agent.appeared` / `agent.disappeared`
frame triggers an immediate `refresh()`. The interval drops
to a slow fallback (60s) covering attribution drift the daemon can't see
(session-file paths, model, status text — all harness knowledge). On subscribe
failure the hook keeps today's 3s interval — zero behavior change without a
daemon. React specifics: the subscription callback only ever calls the existing
`refresh`, so all existing in-flight/mounted guards still apply; the client is
closed on unmount.

Data flow stays: daemon supplies *invalidation* ("something changed"), the
console still pulls the enriched list from `manager.listAgents`. This is the
honest coordination-only split — daemon events are timing, not content.

## What the daemon does NOT own

Git operations (repo-level locks are the answer there, not a serialization
proxy), releases, skills, agent-side hooks, harness parsing (until the
fixture-contracted port), and any network listener.

## Deviations recorded honestly

- The CLI's `agent list` path was not rewired to the daemon cache at I0:
  attribution and session-file knowledge were client-side, so a daemon-backed
  fast path needed the knowledge port to pay off. (Post-port the raw
  snapshot RPC was removed — the attributed view took over the `agent.list`
  name as the single list API; the agents table is an internal diff ledger.)
- Bridge supervision and capacity caching were scoped to v1.5 by explicit
  decision; the console's event-driven refresh is in v1 (see above) while
  channel-bridge output polling stays client-side (harness parsing).
