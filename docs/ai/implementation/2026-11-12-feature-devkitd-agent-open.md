---
phase: implementation
title: Implementation — devkitd-agent-open
description: Daemon-first `agent open` via agent.lookup with client-side terminal/herdr focus (#409, part of #406)
---

# Implementation — devkitd-agent-open

Model unchanged from #406/#407: the daemon returns location data
(`agent.lookup` → `pid`/`runtime`/`runtimeRef`); the client executes the
focus. GUI focus (`findTerminal`/`focusTerminal` via osascript/iTerm etc.)
and herdr pane focus stay client-side in `focusAgent`. No new RPC, no Rust
or daemon-client changes — reuses `DaemonClient.lookupAgent` from #407.

## What changed

- `cli/commands/agent/open.command.ts` — daemon-first focus target +
  `--debug` routing traces under `ai-devkit:agent:open`. The daemon entry is
  mapped through the shared `createDaemonEntryRegistry` (`factory.ts`), as
  in kill and send.
- `cli/__tests__/commands/agent.test.ts` — `daemon-routed open` suite.

## CLI routing (`agent open <name>`)

1. Local resolution unchanged (`resolveAgentByName` over the list, which is
   already daemon-enriched): `empty`/`not-found` reported, `ambiguous`
   prompts with `select`. The daemon is not contacted when nothing matches.
2. `ensureDaemon` → `lookupAgent(<resolved full name>)` — exact name only;
   partial matching stays client-side.
3. Live registration → `focusAgent({name, pid})` with a registry stub built
   from the daemon entry, so tmux focuses by the daemon's pid and herdr by
   the daemon's `runtimeRef`.
4. `not_found`, `unknown method`, dead registration (`alive:false`), or no
   daemon → legacy `focusAgent` with the listed agent and
   `AgentRegistry.default()` (unchanged behavior; covers legacy-registered
   and unmanaged agents).
5. Other coded or transport errors → reported, exit 1, no focus.

## Known deltas

- Dead registration falls back to the listed pid instead of erroring: the
  live scan just saw a process under that name, and a tombstone's pid may
  have been recycled.
