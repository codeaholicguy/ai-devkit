---
phase: implementation
title: Implementation — devkitd-agent-kill
description: agent.lookup + agent.unregister RPCs on devkitd and daemon-first `agent kill` (#407, part of #406)
---

# Implementation — devkitd-agent-kill

Model unchanged from #406: the daemon owns the registry and process
observation; clients execute runtime operations from the location data the
daemon returns.

## Wire contract

```json
→ {"id":1,"method":"agent.lookup","params":{"name":"my-agent"}}
← {"id":1,"result":{
     "name":"my-agent","type":"claude","pid":12345,
     "runtime":"tmux","runtimeRef":{"session":"my-agent"},
     "cwd":"/repo","pinned":false,"alive":true}}
     // tombstoned/dead registration: "alive":false,"goneAt":<ms>

→ {"id":2,"method":"agent.unregister","params":{"name":"my-agent"}}
← {"id":2,"result":{"name":"my-agent","pid":12345}}

← {"id":3,"error":"No registered agent named \"x\".","code":"not_found",
    "details":{"name":"x"}}
```

`agent.lookup` is the generic name → location primitive; `send`, `open`,
channel and console are expected to resolve through it as they migrate:

- Exact registered name only — fuzzy/partial matching stays client-side.
- Live and tombstoned registrations both resolve. `alive` is a
  `kill(pid, 0)` probe at lookup time; when false, callers must not signal
  `pid` (it may have been recycled) and should only clean up the runtime
  (tmux session / herdr pane).
- `runtimeRef` is the provider handle as stored (`null` if never set):
  tmux `{session}`, herdr `{session, paneId, workspaceId?, tabId?, agentName}`.
- Re-imports the legacy `agents.db` first, so agents registered by the TS
  fallback path resolve too.

`agent.unregister` deletes the registration row (no tombstone) under
`start_mutex`, and deletes the same name from the legacy `agents.db`
(the counterpart of the #406 dual-write) so the name neither lingers for
unmigrated consumers nor re-imports. It never touches the runtime.
`agent.disappeared` still reaches subscribers through the regular sweep.

Types (ts-rs → `packages/daemon-client/src/gen/`): `AgentNameParams`,
`AgentLookupResult`, `AgentUnregisterResult`.

## What changed

- `devkit-core/proto.rs` — the three types above.
- `devkit-core/store/registry.rs` — `Registration.cwd`; `unregister_legacy`.
- `devkitd/rpc/agent/lookup.rs` — handler + shared `find()` (legacy
  re-import → `lookup_name` → `not_found`).
- `devkitd/rpc/agent/unregister.rs` — handler.
- `devkitd/server.rs` — one additive dispatch arm for both methods
  (blocking pool, not `INLINE_METHODS`).
- `daemon-client/client.ts` — `lookupAgent(name)`, `unregisterAgent(name)`.
- `cli/commands/agent/kill.command.ts` — daemon-first kill + `--debug`.

## CLI routing (`agent kill <name>`)

1. `ensureDaemon` → `lookupAgent(name)`.
2. Found → `unregisterAgent` → `stopAgent` driven by the daemon's entry
   (tmux: SIGTERM + `kill-session`; herdr: `pane close`). A dead
   registration passes a no-op `killProcess`, so only the session/pane is
   torn down.
3. `not_found` → existing local resolution (`resolveAgentByName`, covers
   partial names and unmanaged processes). A partial match that resolves
   to a different full name retries step 1 with that name; otherwise
   legacy `stopAgent`.
4. No daemon / `unknown method` → legacy `stopAgent` path unchanged.
5. Other coded or transport errors → reported, exit 1, no local retry.

`--debug` traces each routing decision under `ai-devkit:agent:kill`.

## Known deltas

- Name is freed before teardown (lookup → unregister → teardown, per the
  issue). If teardown fails, the name is already reusable while the
  process may still run.
- No `agent.unregistered` event; subscribers see `agent.disappeared` once
  the sweep notices the process exit.
