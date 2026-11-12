---
phase: implementation
title: Implementation — devkitd-agent-send
description: Daemon-first `agent send --id` via agent.lookup + client-side send (#408, part of #406)
---

# Implementation — devkitd-agent-send

Same model as #406/#407: the daemon returns location data, the client
executes. No new RPC — `send` reuses `agent.lookup` from #407; there is no
daemon-side send.

## What changed

- `cli/services/agent/agent.service.ts` — `SendToAgentOptions.resolveRegistry`:
  optional async hook called with the resolved agent's full name; a returned
  registry overrides `registry` for that send, a throw refuses it.
- `cli/commands/agent/send.command.ts` — `createDaemonSendRouter` + `--debug`.

## CLI routing (`agent send --id <name>`)

`--group` and durable agents (`resolveDurableAgentEntry`) return before any
daemon contact — unchanged.

1. `ensureDaemon` → `agent.lookup(<name>)` on the exact identifier.
   `alive=false` → error `Agent "<name>" is registered but no longer
   running; not sending.`, exit 1.
2. Local resolution (`resolveAgentByName`) as before — partial match,
   ambiguous and not-found reporting unchanged.
3. `agent.lookup(<resolved full name>)` (cached when it equals step 1).
   Found + alive → `sendAgentPrompt` with a registry backed by the daemon
   entry, so the existing tmux / herdr runtime sends client-side from the
   daemon's `runtime` + `runtimeRef`. Dead → refused as in step 1.
4. `not_found` → the local `AgentRegistry`. The daemon also resolves names it
   assigned to sweep-discovered (unregistered) agents, returning
   `runtime=tmux`; delivery matches a local registry miss since the tmux
   runtime sends by pid → terminal.
5. No daemon / `unknown method` → legacy `sendAgentPrompt` path; no further
   lookups in that invocation.
6. Other coded or transport errors → reported, exit 1, no local retry.

`--stdin`, `--wait`, `--timeout`, `--json` are untouched: wait polling still
runs on the locally resolved `AgentInfo`. `--debug` traces each routing
decision under `ai-devkit:agent:send`.

## Known deltas

- tmux send stays pid → terminal lookup (`TmuxAgentRuntime.send` ignores
  `runtimeRef.session`); the daemon entry only selects the runtime. herdr uses
  the daemon's `runtimeRef` directly.
- The daemon connection stays open through `--wait` and is closed afterwards.
- The daemon-entry → `RegistryEntry` mapping is shared with `kill` via
  `createDaemonEntryRegistry` in `commands/agent/factory.ts`.
