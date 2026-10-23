---
phase: requirements
title: Migrate agent start to devkitd — agent.start RPC, daemon-owned registry
description: Move interactive agent spawning (tmux + herdr) from the TS agent-manager into devkitd; daemon.db becomes the registry source of truth; fixes the discovery-race name loss
---

# Requirements — devkitd-agent-start

## Problem Statement

`ai-devkit agent start` spawns agents entirely on the TypeScript side
(`packages/agent-manager`: `startAgent` → `TmuxAgentRuntime` /
`HerdrAgentRuntime` → `AgentRegistry` SQLite). Meanwhile `devkitd` owns live
process discovery, the enriched agent list, and the event stream. Split
authority produces a concrete, observed bug class:

1. **Discovery race loses the requested name** (GitHub issue #398). The
   console spawns `agent start` as a child CLI; the daemon's 2s sweep sees the
   new process before `registry.register()` lands, so a parent refresh
   registers the fallback `ai-devkit-<pid>` name first — and
   `AgentRegistry.mergeEntry` preserves the existing name, so the fallback
   wins permanently. The user's chosen name is lost and the session preview
   stays unavailable until console restart.
2. **Two sources of truth.** The daemon's `agents` snapshot table knows
   processes; the TS registry DB knows names, runtime, runtimeRef, pinned.
   Neither can answer "who owns this pid" alone.
3. **No start event.** The daemon emits only `agent.appeared` on its sweep
   cadence; subscribers get a late, unattributed notification instead of an
   immediate `agent.started` carrying the requested identity.

## Goals & Objectives

**Primary:**

- Add an `agent.start` JSON-RPC method to devkitd that performs the whole
  start sequence: validate → availability → name-uniqueness → orphan-session
  handling → spawn → PID resolution → register → emit `agent.started`.
- Port both interactive runtimes to Rust: `tmux` (session create, send-keys,
  pane-pid descendant scan, stable-pid polling) and `herdr` (`herdr` CLI:
  workspace create, agent start with `agent_pane_busy` retry, pane
  process-info poll).
- Make `daemon.db` the registry source of truth by extending the existing
  `agents` table with nullable registry columns (`name`, `agent_type`,
  `runtime`, `runtime_ref`, `pinned`, `registered_at`) — one row per process
  carries both observed and declared state.
- CLI routes `agent start` through the daemon when reachable, falling back to
  the current TS path on connect-failure or `unknown method` (old devkitd).
- Structured error codes over the wire so the CLI reproduces today's exact
  messages and exit codes.

**Secondary:**

- Emit `agent.started` immediately (don't wait for the sweep) and refresh the
  enriched cache so `agent.list` shows the registered name at once.
- Every-boot delta import of the legacy agents DB into `daemon.db` so
  pre-migration rows heal forward.
- Dual-write registrations into the legacy agents DB while it exists so
  unmigrated consumers (`send`, `kill`, `rename`, `open`, channel bridge)
  keep working.

**Non-goals:**

- Durable agents (`--mode durable` / `createDurableAgentService`) stay
  entirely on the TS path.
- Migrating `agent stop|send|rename|open|pin` to RPC — out of scope; they
  keep working via the dual-write bridge.
- Daemon-spawned processes for channels, bridge supervision, scheduled work.
- Version-gated daemon restart on CLI upgrade (tracked separately, #376) —
  this feature only needs the `unknown method` fallback.
- Changes to the wire protocol framing (still newline-delimited JSON).

## User Stories & Use Cases

- As a CLI user, `ai-devkit agent start --type claude --name foo --cwd .`
  prints the same success line, working directory, and attach hint whether
  the daemon or the fallback path served it — and the requested name always
  sticks.
- As a console user, starting an agent from the start pane shows it in the
  list under its requested name immediately (the console spawns the CLI
  subprocess, which routes through the daemon).
- As an agent-running-an-agent, `agent.start` is callable over the socket
  without a nested CLI subprocess.
- As a maintainer, harness start knowledge lives next to the harness adapter
  in `devkit-harness`, not split across languages.

**Edge cases:**

- Same name started twice concurrently → `name_in_use`, not a tmux-session
  clobber race.
- Registered pid dies before the next sweep → tombstone row keeps
  `runtime_ref` so the orphaned tmux/herdr pane is still cleanable by name.
- Pid reused by an unrelated process → must not inherit the dead agent's
  name (identity is `(pid, start_time_ms)`).
- Daemon spawned under systemd/autostart has a narrower `PATH` than the
  invoking shell — `tmux`/`herdr` binaries must resolve in the daemon's env.
- Client disconnects mid-start → daemon completes the start; the agent is
  registered and visible in `agent.list` (strictly better than today's
  orphaned-session outcome).

## Success Criteria

- `ai-devkit agent start` succeeds through the daemon for every startable
  harness type on both runtimes; output and exit codes match the current
  CLI exactly.
- Requested name is authoritative: no `ai-devkit-<pid>` fallback clobber
  even when the sweep wins the race (regression for #398).
- `agent.started` event is emitted and replayable via `subscribe
  {"afterSeq"}`; `agent.list` returns the agent under its requested name
  immediately after the RPC resolves.
- Duplicate-name start returns `name_in_use`; dead-pid names are freed by
  liveness-aware pruning.
- With an old devkitd on the socket (`unknown method`) or no daemon at all,
  the CLI falls back to the TS path and still succeeds.
- `cargo test`, `cargo clippy -D warnings`, `cargo fmt --check` green;
  `nx run-many -t build,test,lint` green including daemon-client typecheck
  against regenerated proto types.
- Legacy agents DB receives the dual-written row while it exists; on daemon
  boot, missing rows are imported.

## Constraints & Assumptions

- The daemon is per-user, single-process; all registry mutation funnels
  through it, so a `start_mutex` makes name-uniqueness atomic.
- The wire `Response` gains an optional `code` field; `error` stays a
  human-readable string for old clients.
- Blocking RPC: start may take up to `timeoutMs` (default 15s) plus herdr
  retries (~8s worst case). Runs on the blocking pool; client request
  timeout must cover it.
- Harness matchers port as data (`Argv0 | Argv0Contains | AnyBasename`),
  not closures; semantics copied verbatim from `runtimeProfiles.ts`.
- Assumption: `opencode`, `pi`, `muse` need start profiles too even though
  devkit-harness lacks full adapters for them — a start profile is just
  command + match spec + discovery aliases.
- Assumption: user approved dual-write bridge and every-boot delta import
  (decisions from pre-lifecycle brainstorm).

## Questions & Open Items — resolved

- **Registry storage**: merged into the existing `daemon.db.agents` table
  (nullable registry columns) rather than a second table. Requires three
  snapshot rules: NULL-`start_time_ms` rows are "registered, not yet swept"
  (upsert, don't delete); identity-change on a swept row → full delete
  (pid reuse drops names); true disappearance keeps named tombstones for
  runtime_ref cleanup, freeing the name only via prune.
- **Scope**: herdr runtime in; durable agents out.
- **Transition**: dual-write to legacy DB + delta import on boot; remove
  when remaining registry ops migrate to RPC.
- **Cancellation**: daemon completes start even if the client disconnects —
  no `agent.start.cancel` in v1.
