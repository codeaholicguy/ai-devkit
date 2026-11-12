---
phase: implementation
title: Implementation — devkitd-agent-rename
description: atomic daemon-side agent.rename RPC and daemon-first `agent rename` (#410, part of #406)
---

# Implementation — devkitd-agent-rename

Rename is the exception to the #406 client-executes-runtime-ops model:
`runtimeRef.session` *is* the tmux session name, so the registry rename and
`tmux rename-session` / `herdr agent rename` run together daemon-side under
`start_mutex` and can't diverge across clients.

## Wire contract

```json
→ {"id":1,"method":"agent.rename","params":{"from":"old","to":"new"}}
← {"id":1,"result":{
     "from":"old","to":"new","pid":12345,
     "runtime":"tmux","runtimeRef":{"session":"new"},
     "runtimeRenamed":true,"warnings":[]}}

← {"id":2,"error":"Agent \"new\" is already running (PID 4242). Choose a different name.",
    "code":"name_in_use","details":{"pid":4242}}
```

Error codes:

| code | when | registry |
|---|---|---|
| `invalid_params` | `to` fails the agent name rule | unchanged |
| `not_found` | no registration named `from` | unchanged |
| `name_in_use` | live agent holds `to` (`details.pid`), or a tmux session named `to` exists (`details.session`) | unchanged |
| `runtime_unavailable` | tmux runtime but tmux not usable | unchanged |
| `runtime_rename_failed` | `tmux rename-session` / `herdr agent rename` failed (`details.provider`, `details.detail`) | unchanged |

`from == to` is a no-op success with `runtimeRenamed: false`.

Types (ts-rs → `packages/daemon-client/src/gen/`): `AgentRenameParams`,
`AgentRenameResult`.

## Semantics

Order: name check → runtime rename → registry rename (+ legacy mirror).

- A dead holder of `to` is reclaimed: its row is dropped in the same
  transaction as the rename (same liveness rule as `agent.start`).
- tmux: session targeted exactly (`-t =<name>`). Session gone → registry-only
  rename with a warning. `runtimeRef.session` is set to `to` either way, so
  a later agent reusing the old name can't be addressed through this entry.
- herdr: live agent renamed by `paneId`; `runtimeRef.agentName` updated,
  herdr `session` untouched. Dead agent → registry-only (herdr clears names
  when the agent exits).
- Unknown runtime → registry-only with a warning.
- Registry write failure after a successful runtime rename → runtime rename
  is rolled back; rollback failure is logged.
- Legacy `agents.db` row is renamed too (name, `runtime_ref`, `tmux_session`
  for tmux), replacing any dead row holding `to`, so the old name doesn't
  re-import and unmigrated TS consumers see the new name.
- Emits `agent.renamed {from, to, pid}` and re-runs the sweep so
  `agent.list` shows the new name immediately.

## What changed

- `devkit-core/proto.rs` — the two types above.
- `devkit-core/store/registry.rs` — `rename_registration` (in place, keeps
  pin/cwd/sweep identity), `rename_legacy`.
- `devkitd/runtime/tmux.rs` — `session_exists_exact`, `rename_session`.
- `devkitd/runtime/herdr.rs` — `rename_agent` (surfaces herdr's JSON error).
- `devkitd/rpc/agent/rename.rs` — handler.
- `devkitd/server.rs` — dispatch arm (blocking pool, not `INLINE_METHODS`).
- `daemon-client/client.ts` — `renameAgent(from, to)`.
- `cli/commands/agent/rename.command.ts` — daemon-first rename + `--debug`.

## CLI routing (`agent rename <current> <new>`)

1. Name validation and same-name check stay client-side.
2. `ensureDaemon` → `renameAgent`. Success → print warnings, done.
3. No daemon / `unknown method` → legacy `AgentRegistry.rename` unchanged.
4. Any other coded or transport error → reported, exit 1, no local retry
   (the daemon guarantees the registry is unchanged). `not_found` and
   agent-held `name_in_use` keep the legacy wording.

`--debug` traces each routing decision under `ai-devkit:agent:rename`.

## Known deltas

- The legacy path renames the registry only; the daemon path also renames
  the tmux session / herdr agent, so behavior differs by which path runs.
- Exact registered name only — no partial-name matching (same as before).
